# security.tf

# Load Balancer Security Group: Edit to restrict access to the apilication
resource "aws_security_group" "lb" {
  name        = "cb-load-balancer-security-group"
  description = "controls access to the load balancer"
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

# Traffic to the ECS cluster should only come from the load balancer
resource "aws_security_group" "ecs_tasks" {
  name        = "cb-ecs-tasks-security-group"
  description = "allow inbound access from the load balancer only"
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
