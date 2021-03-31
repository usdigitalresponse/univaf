output "addr" {
  value = "${aws_db_instance.main.engine}://${aws_db_instance.main.username}:${aws_db_instance.main.password}@${aws_db_instance.main.endpoint}"
}

output "url" {
  value = "${aws_db_instance.main.engine}://${aws_db_instance.main.username}:${aws_db_instance.main.password}@${aws_db_instance.main.endpoint}/${aws_db_instance.main.name}"
}
