
module "db" {
  source = "./modules/rds"

  vpc_id            = aws_vpc.main.id
  subnet_ids        = aws_subnet.private[*].id
  password          = var.db_password
  username          = var.db_user
  database          = "postgres" # RDS has a restriction here for the database name, no hyphens
  name              = "availability-db"
  engine            = "postgres"
  engine_version    = "13.1"
  allocated_storage = var.db_size
  instance_class    = var.db_instance
  ingress_allow_security_groups = compact([
    aws_security_group.ecs_tasks.id,
    aws_security_group.bastion_security_group.id
  ])
  performance_insights_enabled = true
}
