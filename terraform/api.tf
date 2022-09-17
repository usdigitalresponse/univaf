# Add DNS (optional)
data "aws_route53_zone" "domain_zone" {
  count = var.domain_name != "" ? 1 : 0
  name  = var.domain_name
}

resource "aws_route53_record" "api_domain_record" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = data.aws_route53_zone.domain_zone[0].zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.univaf_api[0].domain_name
    zone_id                = aws_cloudfront_distribution.univaf_api[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api_www_domain_record" {
  count   = var.domain_name != "" ? 1 : 0
  zone_id = data.aws_route53_zone.domain_zone[0].zone_id
  name    = "www"
  type    = "CNAME"
  records = [var.domain_name]
  ttl     = 300
}


# These log groups and streams are associated with a tasks that no longer run,
# but we are preserving the logs for a little while longer.
resource "aws_cloudwatch_log_group" "data_snapshot_log_group" {
  name              = "/ecs/daily-data-snapshot"
  retention_in_days = 30

  tags = {
    Name = "daily-data-snapshot"
  }
}

resource "aws_cloudwatch_log_stream" "data_snapshot_log_stream" {
  name           = "daily-data-snapshot-log-stream"
  log_group_name = aws_cloudwatch_log_group.data_snapshot_log_group.name
}

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


# Use CloudFront as a caching layer in front of the API server (Render does not
# provide a built-in one). Enabled only if var.domain, var.api_remote_domain and
# var.ssl_certificate_arn are provided.
resource "aws_cloudfront_distribution" "univaf_api" {
  count = (
    var.domain_name != ""
    && var.ssl_certificate_arn != ""
    && var.api_remote_domain_name != "" ? 1 : 0
  )
  enabled      = true
  price_class  = "PriceClass_100" # North America
  aliases      = [var.domain_name, "www.${var.domain_name}"]
  http_version = "http2and3"

  origin {
    origin_id   = var.domain_name
    domain_name = var.api_remote_domain_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_ssl_protocols   = ["SSLv3", "TLSv1", "TLSv1.1", "TLSv1.2"]
      origin_protocol_policy = var.api_remote_domain_name != "" ? "https-only" : "http-only"
    }
  }

  default_cache_behavior {
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = var.domain_name
    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    max_ttl                = 3600

    forwarded_values {
      headers      = ["Host", "Origin"]
      query_string = true

      cookies {
        forward = "none"
      }
    }
  }

  viewer_certificate {
    acm_certificate_arn = var.ssl_certificate_arn
    ssl_support_method  = "sni-only"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}
