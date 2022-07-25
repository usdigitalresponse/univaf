# Resources for the API Service

# These domains are managed in AWS, but point to non-AWS resources.
data "aws_route53_zone" "domain_zone" {
  count = var.domain_name != "" ? 1 : 0
  name  = var.domain_name
}

resource "aws_route53_record" "api_domain_record" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = data.aws_route53_zone.domain_zone[0].zone_id
  name    = var.domain_name
  type    = "CNAME"
  records = [var.api_remote_domain_name]
  ttl     = 300
}

resource "aws_route53_record" "api_www_domain_record" {
  count   = var.domain_name != "" ? 1 : 0
  zone_id = data.aws_route53_zone.domain_zone[0].zone_id
  name    = "www"
  type    = "CNAME"
  records = [var.domain_name]
  ttl     = 300
}

# This log group is maintained for historical reference.
resource "aws_cloudwatch_log_group" "data_snapshot_log_group" {
  name              = "/ecs/daily-data-snapshot"
  retention_in_days = 30

  tags = {
    Name = "daily-data-snapshot"
  }
}

# This log group is maintained for historical reference.
resource "aws_cloudwatch_log_group" "api_log_group" {
  name              = "/ecs/api"
  retention_in_days = 30

  tags = {
    Name = "api"
  }
}
