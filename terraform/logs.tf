# logs.tf

# Set up CloudWatch group and log stream and retain logs for 30 days
resource "aws_cloudwatch_log_group" "api_log_group" {
  name              = "/ecs/api"
  retention_in_days = 30

  tags = {
    Name = "api"
  }
}

resource "aws_cloudwatch_log_stream" "api_log_stream" {
  name           = "api-log-stream"
  log_group_name = aws_cloudwatch_log_group.api_log_group.name
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