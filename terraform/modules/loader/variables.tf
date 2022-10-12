
variable "loader_image" {
  description = "The image for the loader to use"
}

variable "loader_source" {
  description = "The source to run (cvsScraper, cvsApi, etc)"
}

variable "command" {
  description = "The arguments to the univaf-loader command"
  default     = []
}

variable "api_url" {
  description = "The target API to populate"
}

variable "api_key" {
  description = "The API key to use for auth"
}

variable "name" {
  description = "The name of the source"
}

variable "sentry_dsn" {
  description = "The Sentry.io DSN to use for error reporting"
  default     = ""
  sensitive   = true
}

variable "role" {
  description = "The ECS task role to run as"
}

variable "schedule" {
  description = "The expression to schedule at (see https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-schedule-expressions.html)"
  default     = "rate(5 minutes)"
}

variable "cluster_arn" {

}

variable "subnets" {

}

variable "env_vars" {
  default = {}
}

variable "enabled" {
  description = "Whether the task should actually run as scheduled"
  type        = bool
  default     = true
}

variable "datadog_enabled" {
  description = "Should datadog be enabled for this task"
  default     = false
}

variable "datadog_api_key" {
  description = "The datadog api key to be used for this container"
  default     = ""
}
