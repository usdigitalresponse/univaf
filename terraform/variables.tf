variable "aws_region" {
  description = "The AWS region things are created in"
  default     = "us-west-2"
}

variable "az_count" {
  description = "Number of AZs to cover (within the chosen region)"
  default     = 2
}

variable "ssl_certificate_arn" {
  description = "To enable HTTPS, the ARN of an SSL certificate created with ACM in us-east-1"
  default     = ""
}

variable "domain_name" {
  description = "The domain name to use for HTTPS traffic"
  default     = ""
}

variable "api_remote_domain_name" {
  description = "The domain name for a service outside AWS to send traffic to"
  default     = ""
}

variable "data_snapshot_s3_bucket" {
  description = "The S3 bucket to store database snapshot data into"
  default     = "univaf-data-snapshots"
}

variable "db_user" {
  description = "The database user"
  default     = "univaf"
}

variable "db_password" {
  description = "The password for the database instance, filled via Terraform"
  sensitive   = true
}

variable "db_instance" {
  description = "The instance type for the DB. Reference: https://aws.amazon.com/rds/instance-types/"
  default     = "db.t4g.small"
}

variable "db_size" {
  description = "The storage size for the DB (in Gigabytes)"
  default     = 30
}

variable "api_keys" {
  description = "List of valid API keys for posting data to the API service"
  type        = list(string)
}

variable "api_port" {
  description = "Port to send HTTP traffic to in API service"
  default     = 3000
}

variable "api_health_check_path" {
  default = "/health"
}

variable "api_cpu" {
  description = "CPU units to provision for each API service instance (1 vCPU = 1024 CPU units) - Allowed values: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html#fargate-tasks-size"
  default     = 1024
}

variable "api_memory" {
  description = "Memory to provision for each API service instance (in MiB) - Allowed values: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html#fargate-tasks-size"
  default     = 2048
}

variable "api_sentry_dsn" {
  description = "The Sentry.io DSN to use for the API service"
  default     = ""
  sensitive   = true
}

variable "api_sentry_traces_sample_rate" {
  description = "The sample rate for Sentry performance monitoring in the API service"
  type        = number
  default     = 0.01

  validation {
    condition     = var.api_sentry_traces_sample_rate >= 0.0 && var.api_sentry_traces_sample_rate <= 1.0
    error_message = "The api_sentry_traces_sample_rate variable must be between 0 and 1."
  }
}

variable "datadog_api_key" {
  description = "API key for sending metrics to Datadog"
  sensitive   = true
}

# These AWS variables are present to clean up warnings in terraform
variable "AWS_SECRET_ACCESS_KEY" {
  default = ""
}

variable "AWS_ACCESS_KEY_ID" {
  default = ""
}
