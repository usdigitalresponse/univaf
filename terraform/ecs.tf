# ecs.tf

resource "aws_ecs_cluster" "main" {
  name = "cluster"
}

module "api_task" {
  source = "./modules/task"

  name   = "api-task"
  image  = var.api_image
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

module "db_seed_task" {
  source = "./modules/task"

  name  = "db-seed-task"
  image = "681497372638.dkr.ecr.us-west-2.amazonaws.com/appointment-db-seed"
  role  = aws_iam_role.ecs_task_execution_role.arn

  env_vars = {
    DB_HOST     = module.db.host
    DB_NAME     = module.db.db_name
    DB_USERNAME = var.db_user
    DB_PASSWORD = var.db_password
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