# Domains and CDN/Caching Layers
#
# The DNS zone (defined by the `domain_name` variable) should be manually
# created in the AWS console, but all the records for the domain and subdomains
# are managed here in code.
#
# The domains all point to CloudFront distributions for caching and DOS
# protection. These are only turned on if there is also an SSL certificate
# (set in the `ssl_certificate_arn` variable, and which also needs to be
# created manually in the AWS console).

locals {
  # The domain of the API service's load balancer (not for public use).
  api_internal_subdomain = "api.internal"
  api_internal_domain = (
    var.domain_name != ""
    ? "${local.api_internal_subdomain}.${var.domain_name}"
    : ""
  )

  # Domain at which to serve archived, historical data (stored in S3).
  data_snapshots_subdomain = "archives"
  data_snapshots_domain = (
    var.domain_name != ""
    ? "${local.data_snapshots_subdomain}.${var.domain_name}"
    : ""
  )
}

# Domain DNS Recods -----------------------------------------------------------

data "aws_route53_zone" "domain_zone" {
  count = var.domain_name != "" ? 1 : 0
  name  = var.domain_name
}

# DNS record for the domain specified in the `domain_name` variable.
resource "aws_route53_record" "api_domain_record" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = data.aws_route53_zone.domain_zone[0].zone_id
  name    = var.domain_name
  type    = "CNAME"
  records = [var.domain_name_remote_api]
  ttl     = 300
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
  name    = local.api_internal_subdomain
  type    = "A"

  alias {
    name                   = aws_alb.main.dns_name
    zone_id                = aws_alb.main.zone_id
    evaluate_target_health = false
  }
}

# The `ecs.` subdomain.
# This specifically points to the deployment on ECS (as opposed to a possible
# external host).
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

# Use CloudFront as a caching layer in front of the API server that's running
# in ECS. Enabled only if var.domain and var.ssl_certificate_arn are provided.
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
    domain_name = local.api_internal_domain

    custom_header {
      name  = var.api_cloudfront_secret_header_name
      value = var.api_cloudfront_secret
    }

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_ssl_protocols   = ["SSLv3", "TLSv1", "TLSv1.1", "TLSv1.2"]
      origin_protocol_policy = "https-only"
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
      headers      = ["Host", "Origin", "Authorization", "x-api-key"]
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

# Provide a protective caching layer and a nice domain name for the S3 bucket
# with historical data. (Allowing direct public access can get expensive.)
# Docs: https://github.com/cloudposse/terraform-aws-cloudfront-s3-cdn
module "univaf_data_snaphsots_cdn" {
  count = (
    var.domain_name != ""
    && var.ssl_certificate_arn != "" ? 1 : 0
  )
  # NOTE: If upgrading this module, please check whether it's now compatible
  # with the current version of the AWS provider and upgrade that, too!
  # See https://github.com/cloudposse/terraform-aws-cloudfront-s3-cdn/issues/279
  source  = "cloudposse/cloudfront-s3-cdn/aws"
  version = "0.90.0"

  origin_bucket                     = aws_s3_bucket.data_snapshots.bucket
  dns_alias_enabled                 = true
  aliases                           = [local.data_snapshots_domain]
  parent_zone_id                    = data.aws_route53_zone.domain_zone[0].zone_id
  acm_certificate_arn               = var.ssl_certificate_arn
  cloudfront_access_logging_enabled = false

  default_ttl     = 60 * 60 * 24 * 7 # 1 Week
  http_version    = "http2and3"
  allowed_methods = ["GET", "HEAD", "OPTIONS"]
  cached_methods  = ["GET", "HEAD", "OPTIONS"]
  # By default, CORS headers are forwarded, but we don't really care about them
  # since the bucket is not operating in "website" mode.
  forward_header_values = []

  # HACK: this module creates bad values if you don't explicitly set one or
  # more of namespace, environment, stage, name, or attributes.
  # Basically, Cloud Posse modules generate an internal ID from the above,
  # and that ID is used for lots of things. Bad stuff happens if it is empty.
  # This issue is marked as closed, but is not actually solved:
  # https://github.com/cloudposse/terraform-aws-cloudfront-s3-cdn/issues/151
  namespace = "cp"
  name      = "univaf_data_snaphsots_cdn"
}
