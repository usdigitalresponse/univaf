# Loader
#
# This module runs the UNIVAF loader script in an ECS cluster on a given
# schedule.

module "loader_task" {
  source = "../task"

  name  = var.name
  image = var.loader_image
  role  = var.role
  # Only certain CPU/Memory combinations are allowed. See:
  # https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html#fargate-tasks-size
  cpu     = 256
  memory  = 512
  port    = 3000
  command = concat(var.command, [var.loader_source])

  env_vars = merge({
    API_URL    = var.api_url
    API_KEY    = var.api_key
    SENTRY_DSN = var.sentry_dsn
  }, var.env_vars)

  datadog_enabled = var.datadog_enabled
  datadog_api_key = var.datadog_api_key
}

moved {
  from = aws_cloudwatch_log_group.log_group
  to   = module.loader_task.aws_cloudwatch_log_group.log_group
}

moved {
  from = aws_cloudwatch_log_stream.log_stream
  to   = module.loader_task.aws_cloudwatch_log_stream.log_stream
}

module "loader_schedule" {
  count  = var.enabled ? 1 : 0
  source = "../../modules/schedule"

  task        = module.loader_task
  schedule    = var.schedule
  cluster_arn = var.cluster_arn
  subnets     = var.subnets
}
