
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
 * Define the two container definitions and the ultimate list we want to use
 */
locals {
  env_vars = merge(
    { ENV = "production", NODE_ENV = "production", SENTRY_ENVIRONMENT = "ecs" },
    var.env_vars
  )

  datadog_container_def = {
    name  = "datadog-agent"
    image = "datadog/agent:latest"
    environment = [
      {
        name  = "DD_API_KEY"
        value = var.datadog_api_key
      },
      {
        name  = "ECS_FARGATE",
        value = "true"
      }
    ]
  }

  container_definition = {
    cpu    = var.cpu
    memory = var.memory

    name  = var.name
    image = var.image

    environment = [for key, val in local.env_vars : { name = key, value = val }]
    entryPoint  = var.entry_point
    command     = var.command

    essential   = true
    networkMode = "awsvpc"
    mountPoints = []
    portMappings = [
      {
        containerPort = var.port
        hostPort      = var.port
      }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/${var.name}"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }

  encoded_containers = (
    var.datadog_enabled
    ? jsonencode([local.container_definition, local.datadog_container_def])
    : jsonencode([local.container_definition])
  )
}

/**
 * Resources.
 */

# The ECS task definition.
resource "aws_ecs_task_definition" "main" {
  family             = var.name
  execution_role_arn = var.role

  lifecycle {
    create_before_destroy = true
  }

  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  container_definitions    = local.encoded_containers

  # TODO: see about running on ARM for less power consumption. I *think* we
  # need to build the images with:
  #   docker buildx build --platform linux/amd64,linux/arm64 ...other-args...
  # See also some tips in:
  #   https://blog.thesparktree.com/docker-multi-arch-github-actions
  # runtime_platform {
  #   operating_system_family = "LINUX"
  #   cpu_architecture        = "ARM64"
  # }
}
