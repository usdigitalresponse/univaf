module "loader_task" {
  source = "../task"

  name  = var.name
  image = "681497372638.dkr.ecr.us-west-2.amazonaws.com/appointment-loader"
  role  = var.role
  cpu    = 1024
  memory = 2048
  port   = 3000
  command = concat(var.command, [var.loader_source])

  env_vars = merge({
    SOURCES     = var.loader_source
    API_URL     = var.api_url
    API_KEY     = var.api_key
    SENTRY_DSN  = var.loader_sentry_dsn
  }, var.env_vars)
}

# Set up CloudWatch group and log stream and retain logs for 30 days
resource "aws_cloudwatch_log_group" "log_group" {
  name              = "/ecs/${var.name}"
  retention_in_days = 30

  tags = {
    Name = var.name
  }
}

resource "aws_cloudwatch_log_stream" "log_stream" {
  name           = "${var.name}-log-stream"
  log_group_name = aws_cloudwatch_log_group.log_group.name
}

# data "aws_iam_policy_document" "target_invocation_role_policy" {
#   statement {
#     actions = ["ecs:RunTask"]
#     resource = "${replace(module.loader_task.task_arn, "/:\\d+$/", ":*")}"
#   }
# }

# data "aws_iam_policy_document" "instance-assume-role-policy" {
#   statement {
#     actions = ["sts:AssumeRole"]

#     principals {
#       type        = "Service"
#       identifiers = ["ecs.amazonaws.com"]
#     }
#   }
# }

# resource "aws_iam_role" "target_invocation_role" {
#   name = "${var.name}-invocation-role"
#   assume_role_policy = data.aws_iam_policy_document.inst
# }

# Set up our schedule
resource "aws_cloudwatch_event_rule" "schedule" {
  name = "${var.name}-schedule"
  description = "Runs ${var.name} every ${var.schedule}"

  schedule_expression = var.schedule
  role_arn = var.role
}

resource "aws_cloudwatch_event_target" "run_task" {
  rule = aws_cloudwatch_event_rule.schedule.name
  arn = var.cluster_arn
  target_id = "${var.name}-schedule"
  role_arn = var.role

  ecs_target {
    task_count          = 1
    task_definition_arn = module.loader_task.arn
    launch_type         = "FARGATE"

    network_configuration {
       subnets = var.subnets
       assign_public_ip = true
    }
  }
}
