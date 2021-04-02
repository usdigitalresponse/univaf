
variable "loader_source" {
  description = "The source to run (cvsScraper, cvsApi, etc)"
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

variable "role" {
  description = "The ECS task role to run as"
}

variable "schedule" {
  description = "The expression to schedule at (see https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-schedule-expressions.html)"
  default = "rate(5 minutes)"
}

variable "cluster_arn" {

}