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

variable "ssl_certificate_arn_api_internal" {
  description = "The ARN of an SSL certificate in ACM to use for the API services load balancer (cerificate must be in the same region as the `aws_region` variable)"
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

variable "data_snapshot_aws_key_id" {
  description = "AWS access key ID for writing to the data snapshot S3 bucket"
  sensitive   = true
}

variable "data_snapshot_aws_secret_key" {
  description = "AWS secret key for writing to the data snapshot S3 bucket"
  sensitive   = true
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
  default     = 48
}

variable "api_cloudfront_secret" {
  description = "A secret key that must be sent as a header to the API load balancer in order to access it. Used to keep the load balancer from being accessed except by CloudFront. (optional)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "api_cloudfront_secret_header_name" {
  description = "Name of the HTTP header to send `api_cloudfront_secret` in."
  default     = "X-Secret-Access-Key"
}

variable "api_keys" {
  description = "List of valid API keys for posting data to the API service. The loaders will use the first key."
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

variable "api_db_pool_size_data" {
  description = "The maximum number of DB connection a single API server can hold for general usage."
  type        = number
  default     = 20
}

variable "api_db_pool_size_availability" {
  description = "The maximum number of DB connection a single API server can hold for logging."
  type        = number
  default     = 10
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

variable "loader_sentry_dsn" {
  description = "The Sentry.io DSN to use for the loaders"
  default     = ""
  sensitive   = true
}

variable "datadog_api_key" {
  description = "API key for sending metrics to Datadog"
  sensitive   = true
}

variable "njvss_aws_key_id" {
  sensitive = true
}

variable "njvss_aws_secret_key" {
  sensitive = true
}

variable "rite_aid_api_url" {
  description = "The Rite Aid API URL"
  default     = "https://api.riteaid.com/digital/Covid19-Vaccine/ProviderDetails"
}

variable "rite_aid_api_key" {
  description = "The Rite Aid API Key"
  sensitive   = true
}

# These AWS variables are present to clean up warnings in terraform
variable "AWS_SECRET_ACCESS_KEY" {
  default = ""
}

variable "AWS_ACCESS_KEY_ID" {
  default = ""
}
