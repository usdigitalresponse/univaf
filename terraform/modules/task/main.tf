
/**
 * The task module creates an ECS task definition.
 *
 * Usage:
 *
 *     module "nginx" {
 *       source = "./modules/task"
 *       name   = "nginx"
 *       image  = "nginx"
 *     }
 *
 */


/**
 * Resources.
 */

# The ECS task definition.

data "template_file" "template" {
  template = file("${path.module}/templates/template.json.tpl")

  vars = {
    cpu           = var.cpu
    memory        = var.memory
    port          = var.port
    image         = var.image
    aws_region    = var.aws_region
    image_version = var.image_version
    env_vars      = jsonencode([for key, val in var.env_vars : { name = key, value = val}])
    name          = var.name
    entry_point   = var.entry_point
    command       = var.command
  }
}


resource "aws_ecs_task_definition" "main" {
  family        = var.name
  task_role_arn = var.role

  lifecycle {
    create_before_destroy = true
  }

  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  container_definitions    = data.template_file.template.rendered
}