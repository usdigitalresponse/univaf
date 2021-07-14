

module "db_seed_task" {
  source = "./modules/task"

  name   = "db-seed"
  image  = aws_ecr_repository.seed_repository.repository_url
  role   = aws_iam_role.ecs_task_execution_role.arn
  cpu    = var.cpu
  memory = var.memory
  port   = var.api_port

  env_vars = {
    DB_HOST     = module.db.host
    DB_NAME     = module.db.db_name
    DB_USERNAME = var.db_user
    DB_PASSWORD = var.db_password
    ENV         = "production"
  }

  depends_on = [aws_alb_listener.front_end, aws_iam_role_policy_attachment.ecs_task_execution_role]
}

# Set up CloudWatch group and log stream and retain logs for 30 days
resource "aws_cloudwatch_log_group" "db_seed_log_group" {
  name              = "/ecs/db-seed"
  retention_in_days = 30

  tags = {
    Name = "db-seed"
  }
}

resource "aws_cloudwatch_log_stream" "db_seed_log_stream" {
  name           = "db-seed-log-stream"
  log_group_name = aws_cloudwatch_log_group.db_seed_log_group.name
}
