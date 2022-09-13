variable "name" {
  description = "The name of the task being scheduled"
}

variable "role" {
  description = "The ECS task role to run as"
}

variable "schedule" {
  description = "The expression to schedule at (see https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-schedule-expressions.html)"
}

variable "cluster_arn" {

}

variable "subnets" {

}

variable "security_groups" {
  default = []
}

variable "task_arn" {
  description = "ARN of the task to schedule"
}
