provider "aws" {
  profile                 = "default"
  region                  = var.aws_region
}

# outputs.tf

output "alb_hostname" {
  value = aws_alb.main.dns_name
}