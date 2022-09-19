# outputs.tf

output "cloudfront_hostname" {
  value = aws_cloudfront_distribution.univaf_api[0].domain_name
}
