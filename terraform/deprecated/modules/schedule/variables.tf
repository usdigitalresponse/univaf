variable "task" {
  description = "The task to run on this schedule"
  type = object({
    name = string
    role = string
    arn  = string
  })
}

variable "schedule" {
  description = "The expression to schedule at (see https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-schedule-expressions.html)"
  type        = string
}

variable "cluster_arn" {
  description = "The ARN of the ECS cluster to run the task on"
}

variable "subnets" {
  description = "The subnets to run the task on"
}

variable "security_groups" {
  description = "Any security groups to add to the task"
  default     = []
}
