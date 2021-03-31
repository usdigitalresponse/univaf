output "host" {
  value = aws_db_instance.main.endpoint
}

output "db_name" {
  value = aws_db_instance.main.name
}