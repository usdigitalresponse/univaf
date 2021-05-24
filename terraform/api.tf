# Load Balancer

resource "aws_alb" "main" {
  name            = "api-load-balancer"
  subnets         = aws_subnet.public.*.id
  security_groups = [aws_security_group.lb.id]
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
    path                = var.health_check_path
    unhealthy_threshold = "2"
  }
}

# Redirect all traffic from the ALB to the target group
resource "aws_alb_listener" "front_end" {
  load_balancer_arn = aws_alb.main.id
  port              = 80
  protocol          = "HTTP"

  default_action {
    target_group_arn = aws_alb_target_group.api.arn
    type             = "forward"
  }
}

# Add HTTPS (optional)
data "aws_acm_certificate" "issued_cert" {
  count    = var.ssl_enabled ? 1 : 0
  domain   = var.domain_name
  statuses = ["ISSUED"]
}

resource "aws_alb_listener" "front_end_https" {
  count             = var.ssl_enabled ? 1 : 0
  load_balancer_arn = aws_alb.main.id
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = data.aws_acm_certificate.issued_cert[0].arn

  default_action {
    target_group_arn = aws_alb_target_group.api.arn
    type             = "forward"
  }
}

# Add DNS (optional)
data "aws_route53_zone" "domain_zone" {
  count = var.domain_name != "" ? 1 : 0
  name  = var.domain_name
}

resource "aws_route53_record" "api_domain_record" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = data.aws_route53_zone.domain_zone[0].zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_alb.main.dns_name
    zone_id                = aws_alb.main.zone_id
    evaluate_target_health = false
  }
}



module "api_task" {
  source = "./modules/task"

  name   = "api"
  image  = var.api_image
  role   = aws_iam_role.ecs_task_execution_role.arn
  cpu    = var.cpu
  memory = var.memory
  port   = var.api_port

  env_vars = {
    # Bump RELEASE to force update the image/restart the service.
    RELEASE     = "24"
    DB_HOST     = module.db.host
    DB_NAME     = module.db.db_name
    DB_USERNAME = var.db_user
    DB_PASSWORD = var.db_password
    API_KEYS    = var.api_key
    SENTRY_DSN  = var.api_sentry_dsn
    HOST_URL    = format("https://%s", var.domain_name)
    ENV         = "production"
  }

  depends_on = [aws_alb_listener.front_end, aws_iam_role_policy_attachment.ecs_task_execution_role]
}

resource "aws_ecs_service" "main" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = module.api_task.arn
  desired_count   = var.api_count
  launch_type     = "FARGATE"

  network_configuration {
    security_groups  = [aws_security_group.ecs_tasks.id]
    subnets          = aws_subnet.private.*.id
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_alb_target_group.api.id
    container_name   = "api"
    container_port   = var.api_port
  }

  depends_on = [aws_alb_listener.front_end, aws_iam_role_policy_attachment.ecs_task_execution_role, module.api_task]
}

# Set up CloudWatch group and log stream and retain logs for 30 days
resource "aws_cloudwatch_log_group" "api_log_group" {
  name              = "/ecs/api"
  retention_in_days = 30

  tags = {
    Name = "api"
  }
}

resource "aws_cloudwatch_log_stream" "api_log_stream" {
  name           = "api-log-stream"
  log_group_name = aws_cloudwatch_log_group.api_log_group.name
}

