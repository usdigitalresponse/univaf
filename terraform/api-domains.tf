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
resource "aws_route53_record" "api_apex_domain_record" {
  count   = var.domain_name != "" ? 1 : 0
  zone_id = data.aws_route53_zone.domain_zone[0].zone_id
  name    = var.domain_name
  type    = "A"
  records = var.domain_name_remote_api_ips
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


# CloudFront ------------------------------------------------------------------

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
