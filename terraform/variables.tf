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

variable "api_image" {
  description = "Docker image to run in the ECS cluster"
  default     = "681497372638.dkr.ecr.us-west-2.amazonaws.com/appointment-server"
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
  default     = 132
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

variable "ssl_enabled" {
  description = "Whether to enable HTTPS for this (note you must configure a cetificate for it!)"
  default     = false
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

variable "loader_sentry_dsn" {
  description = "The Sentry.io DSN to use for the loaders"
  default     = ""
  sensitive   = true
}

variable "bastion_security_group_id" {
  description = "ID for a security group in AWS that allows access to a bastion server inside our VPC. SSHing into this server will allow access to any services that allow this security group."
  default     = "sg-06fc404762de692db"
}
