/**
 * Outputs.
 */

// The created task definition name
output "name" {
  value = aws_ecs_task_definition.main.family
}

// The created task definition ARN
output "arn" {
  value = aws_ecs_task_definition.main.arn
}

// The revision number of the task definition
output "revision" {
  value = aws_ecs_task_definition.main.revision
}