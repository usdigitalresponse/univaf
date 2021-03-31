variable "name" {
  description = "RDS instance name"
}

variable "engine" {
  description = "Database engine: mysql, postgres, etc."
  default     = "postgres"
}

variable "engine_version" {
  description = "Database version"
  default     = "13.1"
}

variable "port" {
  description = "Port for database to listen on"
  default     = 5432
}

variable "database" {
  description = "The database name for the RDS instance (if not specified, `var.name` will be used)"
  default     = ""
}

variable "username" {
  description = "The username for the RDS instance (if not specified, `var.name` will be used)"
  default     = ""
}

variable "password" {
  description = "Postgres user password"
}

variable "multi_az" {
  description = "If true, database will be placed in multiple AZs for HA"
  default     = false
}

variable "backup_retention_period" {
  description = "Backup retention, in days"
  default     = 5
}

variable "backup_window" {
  description = "Time window for backups."
  default     = "00:00-01:00"
}

variable "maintenance_window" {
  description = "Time window for maintenance."
  default     = "Mon:01:00-Mon:02:00"
}

variable "monitoring_interval" {
  description = "Seconds between enhanced monitoring metric collection. 0 disables enhanced monitoring."
  default     = "0"
}

variable "monitoring_role_arn" {
  description = "The ARN for the IAM role that permits RDS to send enhanced monitoring metrics to CloudWatch Logs. Required if monitoring_interval > 0."
  default     = ""
}

variable "apply_immediately" {
  description = "If false, apply changes during maintenance window"
  default     = true
}

variable "allow_major_version_upgrade" {
  description = "If true, major version upgrades are allowed"
  default     = false
}

variable "instance_class" {
  description = "Underlying instance type"
  default     = "db.t2.micro"
}

variable "storage_type" {
  description = "Storage type: standard, gp2, or io1"
  default     = "gp2"
}

variable "allocated_storage" {
  description = "Disk size, in GB"
  default     = 10
}

variable "publicly_accessible" {
  description = "If true, the RDS instance will be open to the internet"
  default     = false
}

variable "vpc_id" {
  description = "The VPC ID to use"
}

variable "ingress_allow_security_groups" {
  description = "A list of security group IDs to allow traffic from"
  type        = list(string)
  default     = []
}

variable "ingress_allow_cidr_blocks" {
  description = "A list of CIDR blocks to allow traffic from"
  type        = list(string)
  default     = []
}

variable "subnet_ids" {
  description = "A list of subnet IDs"
  type        = list(string)
}