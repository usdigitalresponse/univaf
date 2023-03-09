output "host" {
  value = aws_db_instance.main.address
}

output "db_name" {
  value = aws_db_instance.main.db_name
}

output "access_group_id" {
  value = aws_security_group.db_access.id
}

output "access_group_arn" {
  value = aws_security_group.db_access.arn
}
