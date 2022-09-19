variable "aws_region" {
  description = "The AWS region things are created in"
  default     = "us-west-2"
}

variable "ecs_task_execution_role_name" {
  description = "ECS task execution role name"
  default     = "myEcsTaskExecutionRole"
}

variable "az_count" {
  description = "Number of AZs to cover in a given region"
  default     = 2
}

variable "api_port" {
  description = "Port exposed by the docker image to redirect traffic to"
  default     = 3000
}

variable "ssl_certificate_arn" {
  description = "To enable HTTPS, the ARN of an SSL certificate created with ACM in us-east-1"
  default     = ""
}

variable "domain_name" {
  description = "The domain name to use for HTTPS traffic"
  default     = ""
}

variable "api_remote_domain_name_test" {
  description = "The domain name for a service outside AWS to send traffic to"
  default     = ""
}

variable "ssl_certificate_arn_render_test" {
  description = "To enable HTTPS, the ARN of an SSL certificate created with ACM in us-east-1"
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

# These AWS variables are present to clean up warnings in terraform
variable "AWS_SECRET_ACCESS_KEY" {
  default = ""
}

variable "AWS_ACCESS_KEY_ID" {
  default = ""
}
