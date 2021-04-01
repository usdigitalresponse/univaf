[
  {
    "cpu": "${cpu}",
    "memory": "${memory}",
    "environment": ${env_vars},
    "essential": true,
    "command": [],
    "image": "${image}:${image_version}",
    "name": "${name}",
    "portMappings": [
        {
        "containerPort": "${port}",
        "hostPort": "${port}"
      }
    ],
    "entryPoint": [],
    "networkMode": "awsvpc",
    "mountPoints": [],
    "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/${name}",
          "awslogs-region": "${aws_region}",
          "awslogs-stream-prefix": "ecs"
        }
    }
  }
]