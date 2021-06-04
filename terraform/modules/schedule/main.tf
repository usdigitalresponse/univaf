resource "aws_cloudwatch_event_rule" "schedule" {
  name        = "${var.name}-schedule"
  description = "Runs ${var.name} every ${var.schedule}"

  schedule_expression = var.schedule
  role_arn            = var.role
}

resource "aws_cloudwatch_event_target" "run_task" {
  rule      = aws_cloudwatch_event_rule.schedule.name
  arn       = var.cluster_arn
  target_id = "${var.name}-schedule"
  role_arn  = var.role

  ecs_target {
    task_count          = 1
    task_definition_arn = var.task_arn
    launch_type         = "FARGATE"

    network_configuration {
      subnets          = var.subnets
      security_groups  = var.security_groups
      assign_public_ip = true
    }
  }
}
