variable "aws_region" {
  description = "The AWS region things are created in"
  default     = "us-west-2"
}

variable "domain_name" {
  description = "The domain name to use for HTTPS traffic"
  default     = ""
}

variable "api_remote_domain_name" {
  description = "The domain name for a service outside AWS to send traffic to"
  default     = ""
}

# These AWS variables are present to clean up warnings in terraform
variable "AWS_SECRET_ACCESS_KEY" {
  default = ""
}

variable "AWS_ACCESS_KEY_ID" {
  default = ""
}
