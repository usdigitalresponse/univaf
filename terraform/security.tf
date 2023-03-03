# Security Groups
#
# Security groups control inbound and outbound network connections to various
# services (databases, ECS tasks, EC2 instances, load balancers, etc.).

# ALB Security Group: Edit to restrict access to the API Server
resource "aws_security_group" "lb" {
  name        = "univaf-api-load-balancer-security-group"
  description = "Controls access to the API server load balancer"
  vpc_id      = aws_vpc.main.id

  ingress {
    protocol    = "tcp"
    from_port   = 80
    to_port     = 80
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    protocol    = "tcp"
    from_port   = 443
    to_port     = 443
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# FIXME: remove this when no longer in use!
# (Transitioning to `aws_security_group.api_server_tasks`)
resource "aws_security_group" "ecs_tasks" {
  name        = "univaf-ecs-tasks-security-group"
  description = "Allow inbound access only from the load balancer"
  vpc_id      = aws_vpc.main.id

  ingress {
    protocol        = "tcp"
    from_port       = var.api_port
    to_port         = var.api_port
    security_groups = [aws_security_group.lb.id]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Traffic to the tasks that run the the API server in ECS should only accept
# traffic from the load balancer; the public internet and other resources in AWS
# should not be able to route directly to them.
resource "aws_security_group" "api_server_tasks" {
  name        = "univaf-api-server-tasks-security-group"
  description = "Allow inbound access only from the load balancer"
  vpc_id      = aws_vpc.main.id

  ingress {
    protocol        = "tcp"
    from_port       = var.api_port
    to_port         = var.api_port
    security_groups = [aws_security_group.lb.id]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Cron Job-like tasks on ECS may need to reach out to other servicers to load
# things, but nothing else should be initiating communication with them.
resource "aws_security_group" "cron_job_tasks" {
  name        = "univaf-cron-job-tasks-security-group"
  description = "No inbound access, in univaf-vpc, for ECS Cron Jobs"
  vpc_id      = aws_vpc.main.id

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}
