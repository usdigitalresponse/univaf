# API Service
#
# The API server (code in the `server` directory) runs as a service on ECS. It
# serves the public API and receives updates from the loaders.
#
# The API also has a scheduled job that runs once a day to archive the state of
# the database and log all the updates it received that day. That job is also
# a task that runs on ECS (but just a task that runs to completion, not a
# service that ECS keeps running).

# API Service -----------------------------------------------------------------

# The actual task that runs on ECS.
module "api_task" {
  source = "./modules/task"

  name  = "api"
  image = "${aws_ecr_repository.server_repository.repository_url}:${var.api_release_version}"
  role  = aws_iam_role.ecs_task_execution_role.arn
  # Only certain CPU/Memory combinations are allowed. See:
  # https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html#fargate-tasks-size
  cpu    = var.api_cpu
  memory = var.api_memory
  port   = var.api_port

  # Enable Datadog
  datadog_enabled = true
  datadog_api_key = var.datadog_api_key

  env_vars = {
    RELEASE                   = var.api_release_version
    DB_HOST                   = module.db.host
    DB_NAME                   = module.db.db_name
    DB_USERNAME               = var.db_user
    DB_PASSWORD               = var.db_password
    DB_POOL_SIZE_DATA         = format("%d", var.api_db_pool_size_data)
    DB_POOL_SIZE_AVAILABILITY = format("%d", var.api_db_pool_size_availability)
    API_KEYS                  = join(",", var.api_keys)
    SENTRY_DSN                = var.api_sentry_dsn
    SENTRY_TRACES_SAMPLE_RATE = format("%.2f", var.api_sentry_traces_sample_rate)
    PRIMARY_HOST              = var.domain_name
  }

  depends_on = [aws_alb_listener.front_end, aws_iam_role_policy_attachment.ecs_task_execution_role]
}

# The service's load balancer.
resource "aws_alb" "main" {
  name                       = "api-load-balancer"
  subnets                    = aws_subnet.public.*.id
  security_groups            = [aws_security_group.lb.id]
  drop_invalid_header_fields = true
}

resource "aws_alb_target_group" "api" {
  name        = "api-target-group"
  port        = var.api_port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    healthy_threshold   = "3"
    interval            = "30"
    protocol            = "HTTP"
    matcher             = "200"
    timeout             = "3"
    path                = var.api_health_check_path
    unhealthy_threshold = "2"
  }
}

# Redirect all traffic from the ALB to the target group
resource "aws_alb_listener" "front_end" {
  load_balancer_arn = aws_alb.main.id
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# Redirect all traffic from the ALB to the target group
resource "aws_alb_listener" "front_end_https" {
  load_balancer_arn = aws_alb.main.id
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-FS-1-2-Res-2020-10"
  certificate_arn   = var.ssl_certificate_arn_api_internal

  # Other rules below will forward if the request is OK.
  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Access Denied"
      status_code  = "403"
    }
  }
}

resource "aws_alb_listener_rule" "redirect_www" {
  listener_arn = aws_alb_listener.front_end_https.arn
  priority     = 10

  condition {
    host_header {
      values = ["www.${var.domain_name}"]
    }
  }

  action {
    type = "redirect"

    redirect {
      host        = var.domain_name
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# If a special secret is required for access (i.e. to allow only CloudFront and
# not any request directly from the public internet), check it before forwarding
# to the API service.
resource "aws_lb_listener_rule" "api_forward_if_secret_header" {
  listener_arn = aws_alb_listener.front_end_https.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_alb_target_group.api.arn
  }

  # Add a condition requiring a secret header only if there's a secret to check.
  dynamic "condition" {
    for_each = var.api_cloudfront_secret != "" ? [1] : []
    content {
      http_header {
        http_header_name = var.api_cloudfront_secret_header_name
        values           = [var.api_cloudfront_secret]
      }
    }
  }

  # There must be >= 1 condition; this is a no-op in case there's no secret.
  condition {
    source_ip {
      values = ["0.0.0.0/0"]
    }
  }
}

# Allow requests in if they have a valid API key.
resource "aws_lb_listener_rule" "api_forward_if_api_key" {
  listener_arn = aws_alb_listener.front_end_https.arn
  priority     = 30

  action {
    type             = "forward"
    target_group_arn = aws_alb_target_group.api.arn
  }

  condition {
    http_header {
      http_header_name = "x-api-key"
      values           = var.api_keys
    }
  }
}

# This service definition keeps the API server task running, connects it to the
# load balancer, and manages multiple instances. (The actual scaling policies
# are in a separate file.)
resource "aws_ecs_service" "api_service" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = module.api_task.arn
  desired_count   = 1 # This will get adjusted by autoscaling rules
  launch_type     = "FARGATE"

  lifecycle {
    # Autoscaling rules will tweak this dynamically. Ignore it so Terraform
    # doesn't reset things on every run.
    ignore_changes = [desired_count]
  }

  network_configuration {
    security_groups  = [aws_security_group.api_server_tasks.id]
    subnets          = aws_subnet.public.*.id
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_alb_target_group.api.id
    container_name   = "api"
    container_port   = var.api_port
  }

  depends_on = [aws_alb_listener.front_end, aws_iam_role_policy_attachment.ecs_task_execution_role, module.api_task]
}
