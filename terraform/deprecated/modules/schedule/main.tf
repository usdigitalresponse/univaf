# Schedule task to run in ECS at a given interval or at set times using a
# cron-style expression. Uses EventBridge (formerly CloudWatch Events).
#
# Schedules can use `rate()` expressions to set a frequency or `cron()`
# expressions for more complex timing. For details, see
# https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-schedule-expressions.html

resource "aws_cloudwatch_event_rule" "schedule" {
  name        = "${var.task.name}-schedule"
  description = "Runs ${var.task.name} every ${var.schedule}"

  schedule_expression = var.schedule
  role_arn            = var.task.role
}

resource "aws_cloudwatch_event_target" "run_task" {
  rule      = aws_cloudwatch_event_rule.schedule.name
  arn       = var.cluster_arn
  target_id = "${var.task.name}-schedule"
  role_arn  = var.task.role

  ecs_target {
    task_count          = 1
    task_definition_arn = var.task.arn
    launch_type         = "FARGATE"

    network_configuration {
      subnets          = var.subnets
      security_groups  = var.security_groups
      assign_public_ip = true
    }
  }
}
