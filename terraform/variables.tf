variable "aws_region" {
  description = "The AWS region things are created in"
  default     = "us-west-2"
}

variable "ecs_task_execution_role_name" {
  description = "ECS task execution role name"
  default     = "myEcsTaskExecutionRole"
}

variable "ecs_auto_scale_role_name" {
  description = "ECS auto scale role Name"
  default     = "myEcsAutoScaleRole"
}

variable "az_count" {
  description = "Number of AZs to cover in a given region"
  default     = 2
}

variable "api_port" {
  description = "Port exposed by the docker image to redirect traffic to"
  default     = 3000
}

variable "api_count" {
  description = "Number of docker containers to run"
  default     = 2
}

variable "health_check_path" {
  default = "/health"
}

variable "cpu" {
  description = "Fargate instance CPU units to provision (1 vCPU = 1024 CPU units)"
  default     = 1024
}

variable "memory" {
  description = "Fargate instance memory to provision (in MiB)"
  default     = 2048
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

variable "api_key" {
}

variable "cvs_api_key" {
  description = "The CVS API Key"
  sensitive   = true
}

variable "rite_aid_api_url" {
  description = "The Rite Aid API URL"
  default     = "https://api.riteaid.com/digital/Covid19-Vaccine/ProviderDetails"
}

variable "rite_aid_api_key" {
  description = "The Rite Aid API Key"
  sensitive   = true
}

variable "njvss_aws_key_id" {
  sensitive = true
}

variable "njvss_aws_secret_key" {
  sensitive = true
}

variable "ssl_certificate_arn" {
  description = "To enable HTTPS, the ARN of an SSL certificate created with ACM in us-east-1"
  default     = ""
}

variable "domain_name" {
  description = "The domain name to use for HTTPS traffic"
  default     = ""
}

variable "api_sentry_dsn" {
  description = "The Sentry.io DSN to use for the API service"
  default     = ""
  sensitive   = true
}

variable "api_sentry_traces_sample_rate" {
  description = "The sample rate for Sentry performance monitoring"
  type        = number
  default     = 0.2

  validation {
    condition     = var.api_sentry_traces_sample_rate >= 0.0 && var.api_sentry_traces_sample_rate <= 1.0
    error_message = "api_sentry_traces_sample_rate must be between 0 and 1."
  }
}

variable "loader_sentry_dsn" {
  description = "The Sentry.io DSN to use for the loaders"
  default     = ""
  sensitive   = true
}

variable "data_snapshot_s3_bucket" {
  description = "The S3 bucket to store database snapshot data into"
  default     = "univaf-data-snapshots"
}

variable "data_snapshot_aws_key_id" {
  sensitive = true
}

variable "data_snapshot_aws_secret_key" {
  sensitive = true
}

variable "datadog_api_key" {
  sensitive = true
}

# These AWS variables are present to clean up warnings in terraform
variable "AWS_SECRET_ACCESS_KEY" {
  default = ""
}

variable "AWS_ACCESS_KEY_ID" {
  default = ""
}
