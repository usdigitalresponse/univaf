# Domains and CDN/Caching Layers
#
# The DNS zone (defined by the `domain_name` variable) should be manually
# created in the AWS console, but all the records for the domain and subdomains
# are managed here in code.
#
# The domains all point to CloudFront distributions for caching and DOS
# protection, but the CloudFront distribution might use an external service
# (e.g. Render.com) as its origin. If there's an external origin, it's defined
# by the `api_remote_domain_name` variable.

# Domains ---------------------------------------------------------------------

data "aws_route53_zone" "domain_zone" {
  count = var.domain_name != "" ? 1 : 0
  name  = var.domain_name
}

# DNS record for the domain specified in the `domain_name` variable.
resource "aws_route53_record" "api_domain_record" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = data.aws_route53_zone.domain_zone[0].zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.univaf_api_ecs[0].domain_name
    zone_id                = aws_cloudfront_distribution.univaf_api_ecs[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# The `www.` subdomain. It is an alias for the primary domain name.
resource "aws_route53_record" "api_www_domain_record" {
  count   = var.domain_name != "" ? 1 : 0
  zone_id = data.aws_route53_zone.domain_zone[0].zone_id
  name    = "www"
  type    = "CNAME"
  records = [var.domain_name]
  ttl     = 300
}

# The `api.internal` subdomain. Used for the API service's load balancer so it
# can be secured with HTTPS.
resource "aws_route53_record" "api_load_balancer_domain_record" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = data.aws_route53_zone.domain_zone[0].zone_id
  name    = "api.internal"
  type    = "A"

  alias {
    name                   = aws_alb.main.dns_name
    zone_id                = aws_alb.main.zone_id
    evaluate_target_health = false
  }
}

# The `render.` subdomain.
# This specifically points to the deployment on Render and should be deleted
# when we tear down that deployment.
resource "aws_route53_record" "api_render_domain_record" {
  count = (
    var.domain_name != ""
    && var.api_remote_domain_name != "" ? 1 : 0
  )
  zone_id = data.aws_route53_zone.domain_zone[0].zone_id
  name    = "render"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.univaf_api_render[0].domain_name
    zone_id                = aws_cloudfront_distribution.univaf_api_render[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# The `ecs.` subdomain.
# This specifically points to the deployment on ECS (as opposed to Render).
resource "aws_route53_record" "api_ecs_domain_record" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = data.aws_route53_zone.domain_zone[0].zone_id
  name    = "ecs"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.univaf_api_ecs[0].domain_name
    zone_id                = aws_cloudfront_distribution.univaf_api_ecs[0].hosted_zone_id
    evaluate_target_health = false
  }
}


# CloudFront ------------------------------------------------------------------

# Use CloudFront as a caching layer in front of the remote API server (Render
# does not provide a built-in one). Enabled only if var.domain,
# var.api_remote_domain and var.ssl_certificate_arn are provided.
resource "aws_cloudfront_distribution" "univaf_api_render" {
  count = (
    var.domain_name != ""
    && var.ssl_certificate_arn != ""
    && var.api_remote_domain_name != "" ? 1 : 0
  )
  enabled     = true
  price_class = "PriceClass_100" # North America
  aliases = [
    "render.${var.domain_name}"
  ]
  http_version = "http2and3"

  origin {
    origin_id   = "render.${var.domain_name}"
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
    target_origin_id       = "render.${var.domain_name}"
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

# Use CloudFront as a caching layer in front of the API server that's running
# in ECS. Enabled only if var.domain, and var.ssl_certificate_arn are provided.
resource "aws_cloudfront_distribution" "univaf_api_ecs" {
  count = (
    var.domain_name != ""
    && var.ssl_certificate_arn != "" ? 1 : 0
  )
  enabled     = true
  price_class = "PriceClass_100" # North America
  aliases = [
    var.domain_name,
    "www.${var.domain_name}",
    "ecs.${var.domain_name}"
  ]
  http_version = "http2and3"

  origin {
    origin_id   = "ecs.${var.domain_name}"
    domain_name = aws_alb.main.dns_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_ssl_protocols   = ["SSLv3", "TLSv1", "TLSv1.1", "TLSv1.2"]
      origin_protocol_policy = "http-only"
    }
  }

  default_cache_behavior {
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "ecs.${var.domain_name}"
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
