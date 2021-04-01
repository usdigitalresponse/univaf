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
  default     = "681497372638.dkr.ecr.us-west-2.amazonaws.com/appointment-server:latest"
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
  default     = "1024"
}

variable "memory" {
  description = "Fargate instance memory to provision (in MiB)"
  default     = "2048"
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
  default     = 100
}