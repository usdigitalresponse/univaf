# ecs.tf

resource "aws_ecs_cluster" "main" {
  name = "cluster"
}

data "template_file" "api" {
  template = file("./templates/task_def.json.tpl")

  vars = {
    api_image      = var.api_image
    api_port       = var.api_port
    fargate_cpu    = var.fargate_cpu
    fargate_memory = var.fargate_memory
    aws_region     = var.aws_region
  }
}

module "db_seed_task" {
  source = "./modules/task"

  name = "db-seed-task"
  image = "681497372638.dkr.ecr.us-west-2.amazonaws.com/appointment-db-seed"
  role = aws_iam_role.ecs_task_execution_role.arn

  env_vars = {
    DB_HOST = module.db.host
    DB_NAME = module.db.db_name
    DB_USERNAME = var.db_user
    DB_PASSWORD = var.db_password
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "api-task"
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.fargate_cpu
  memory                   = var.fargate_memory
  container_definitions    = data.template_file.api.rendered
}

resource "aws_ecs_service" "main" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
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

  depends_on = [aws_alb_listener.front_end, aws_iam_role_policy_attachment.ecs_task_execution_role]
}