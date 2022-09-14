module "loader_task" {
  source = "../task"

  name    = var.name
  image   = var.loader_image
  role    = var.role
  cpu     = 512
  memory  = 1024
  port    = 3000
  command = concat(var.command, [var.loader_source])

  env_vars = merge({
    SOURCES    = var.loader_source
    API_URL    = var.api_url
    API_KEY    = var.api_key
    SENTRY_DSN = var.sentry_dsn
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

module "loader_schedule" {
  count  = var.enabled ? 1 : 0
  source = "../../modules/schedule"

  name        = var.name
  schedule    = var.schedule
  role        = var.role
  cluster_arn = var.cluster_arn
  subnets     = var.subnets
  task_arn    = module.loader_task.arn
}
