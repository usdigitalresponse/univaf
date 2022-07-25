variable "aws_region" {
  description = "The AWS region things are created in"
  default     = "us-west-2"
}

variable "az_count" {
  description = "Number of AZs to cover in a given region"
  default     = 2
}

variable "db_password" {
  description = "The password for the database instance, filled via Terraform"
  sensitive   = true
}

variable "db_user" {
  description = "The database user"
  default     = "postgres"
}

variable "db_instance" {
  description = "The instance type for the DB"
  default     = "db.m5.large"
}

variable "db_size" {
  description = "The storage size for the DB"
  default     = 240
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
