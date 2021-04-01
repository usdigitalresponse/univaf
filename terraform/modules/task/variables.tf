/**
 * Required Variables.
 */

variable "image" {
  description = "The docker image name, e.g nginx"
}

variable "name" {
  description = "The worker name, if empty the service name is defaulted to the image name"
}

variable "port" {
  description = "The docker container port"
  default     = 3000
}

/**
 * Optional Variables.
 */

variable "cpu" {
  description = "The number of cpu units to reserve for the container"
  default     = 1024
}

variable "env_vars" {
  description = "The raw json of the task env vars"
  default     = {}
}

variable "command" {
  description = "The raw json of the task command"
  default     = "[]"
} # ["--key=foo","--port=bar"]

variable "entry_point" {
  description = "The docker container entry point"
  default     = "[]"
}

variable "image_version" {
  description = "The docker image version"
  default     = "latest"
}

variable "memory" {
  description = "The number of MiB of memory to reserve for the container"
  default     = 2048
}

variable "log_driver" {
  description = "The log driver to use use for the container"
  default     = "awslogs"
}

variable "role" {
  description = "The IAM Role to assign to the Container"
  default     = ""
}

variable "aws_region" {
  default = "us-west-2"
}