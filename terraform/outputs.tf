# outputs.tf

output "alb_hostname" {
  value = aws_alb.main.dns_name
}

output "cloudfront_hostname_ecs" {
  value = aws_cloudfront_distribution.univaf_api_ecs[0].domain_name
}

output "cloudfront_hostname_render" {
  value = (
    var.api_remote_domain_name != ""
    ? aws_cloudfront_distribution.univaf_api_render[0].domain_name
    : ""
  )
}
