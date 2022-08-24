# outputs.tf

output "alb_hostname" {
  value = aws_alb.main.dns_name
}

output "cloudfront_hostname" {
  value = aws_cloudfront_distribution.univaf_api[0].domain_name
}
