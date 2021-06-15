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
  image  = "${var.api_image}:${var.api_release_version}"
  role   = aws_iam_role.ecs_task_execution_role.arn
  cpu    = var.cpu
  memory = var.memory
  port   = var.api_port

  env_vars = {
    RELEASE     = var.api_release_version
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

module "daily_data_snapshot_task" {
  source = "./modules/task"

  name    = "daily-data-snapshot"
  image   = var.api_image
  command = ["node", "scripts/availability_dump.js", "--write-to-s3", "--clear-log"]
  role    = aws_iam_role.ecs_task_execution_role.arn

  env_vars = {
    DB_HOST                 = module.db.host
    DB_NAME                 = module.db.db_name
    DB_USERNAME             = var.db_user
    DB_PASSWORD             = var.db_password
    SENTRY_DSN              = var.api_sentry_dsn
    DATA_SNAPSHOT_S3_BUCKET = var.data_snapshot_s3_bucket
    AWS_ACCESS_KEY_ID       = var.data_snapshot_aws_key_id
    AWS_SECRET_ACCESS_KEY   = var.data_snapshot_aws_secret_key
    AWS_DEFAULT_REGION      = var.aws_region
    ENV                     = "production"
  }
}

module "daily_data_snapshot_schedule" {
  source = "./modules/schedule"

  name            = module.daily_data_snapshot_task.name
  schedule        = "cron(0 5 * * ? *)"
  role            = aws_iam_role.ecs_task_execution_role.arn
  cluster_arn     = aws_ecs_cluster.main.arn
  subnets         = aws_subnet.public.*.id
  security_groups = [aws_security_group.ecs_tasks.id]
  task_arn        = module.daily_data_snapshot_task.arn
}

resource "aws_cloudwatch_log_group" "data_snapshot_log_group" {
  name              = "/ecs/${module.daily_data_snapshot_task.name}"
  retention_in_days = 30

  tags = {
    Name = module.daily_data_snapshot_task.name
  }
}

resource "aws_cloudwatch_log_stream" "data_snapshot_log_stream" {
  name           = "${module.daily_data_snapshot_task.name}-log-stream"
  log_group_name = aws_cloudwatch_log_group.data_snapshot_log_group.name
}


resource "aws_ecs_service" "main" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = module.api_task.arn
  desired_count   = var.api_count
  launch_type     = "FARGATE"

  lifecycle {
    ignore_changes = [desired_count]
  }

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


# Add API server caching
resource "aws_cloudfront_distribution" "univaf_api" {
  enabled     = true
  price_class = "PriceClass_100" # North America

  origin {
    origin_id   = var.domain_name
    domain_name = var.domain_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_ssl_protocols   = ["SSLv3", "TLSv1", "TLSv1.1", "TLSv1.2"]
      origin_protocol_policy = "http-only"
    }
  }

  default_cache_behavior {
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = var.domain_name
    viewer_protocol_policy = "allow-all"
    min_ttl                = 0
    max_ttl                = 3600

    forwarded_values {
      query_string = true

      cookies {
        forward = "none"
      }
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}
