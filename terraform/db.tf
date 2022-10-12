
module "db" {
  source = "./modules/rds"

  name     = "univaf-db"
  database = "univaf" # RDS does not allow hyphens
  password = var.db_password
  username = var.db_user

  allocated_storage            = var.db_size
  instance_class               = var.db_instance
  engine                       = "postgres"
  engine_version               = "14"
  performance_insights_enabled = true

  vpc_id     = aws_vpc.main.id
  subnet_ids = aws_subnet.private[*].id
  ingress_allow_security_groups = compact([
    aws_security_group.ecs_tasks.id,
    aws_security_group.bastion_security_group.id
  ])
}
