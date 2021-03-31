
module "db" {
  source = "./modules/rds"

  vpc_id            = aws_vpc.main.id
  subnet_ids        = [aws_subnet.private.*.id]
  password          = var.db_password
  username          = var.db_user
  name              = "availability-db"
  engine            = "postgres"
  engine_version    = "13.1"
  allocated_storage = var.db_size
  instance_class    = var.db_instance
}