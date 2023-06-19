variable "aws_region" {
  description = "The AWS region things are created in"
  default     = "us-west-2"
}

variable "ssl_certificate_arn" {
  description = "To enable HTTPS, the ARN of an SSL certificate created with ACM in us-east-1"
  default     = ""
}

variable "domain_name" {
  description = "The domain name to use for HTTPS traffic"
  default     = ""
}

variable "domain_name_remote_api_ips" {
  description = "The IP addresses for a service outside AWS to send API traffic to."
  type        = list(string)
  default     = []
}

variable "data_snapshot_s3_bucket" {
  description = "The S3 bucket to store database snapshot data into"
  default     = "univaf-data-snapshots"
}

# These AWS variables are present to clean up warnings in terraform
variable "AWS_SECRET_ACCESS_KEY" {
  default = ""
}

variable "AWS_ACCESS_KEY_ID" {
  default = ""
}
