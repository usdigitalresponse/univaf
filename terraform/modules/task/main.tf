
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
  container_definitions = <<EOF
[
  {
    "cpu": "${var.cpu}",
    "memory": "${var.memory}",
    "environment": "${var.env_vars}",
    "essential": true,
    "command": "${var.command}",
    "image": "${var.image}:${var.image_version}",
    "name": "${var.name}",
    "portMappings": [
        {
        "containerPort": "${var.port}",
        "hostPort": "${var.port}"
      }
    ],
    "entryPoint": "${var.entry_point}",
    "networkMode": "awsvpc",
    "mountPoints": [],
    "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/${var.name}",
          "awslogs-region": "${var.aws_region}",
          "awslogs-stream-prefix": "ecs"
        }
    }
  }
]
EOF
}