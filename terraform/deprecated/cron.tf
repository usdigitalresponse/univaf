# Cron Job-like tasks on ECS may need to reach out to other services to load
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
