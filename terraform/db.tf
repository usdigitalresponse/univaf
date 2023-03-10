# Database on RDS
#
# The application's database is managed through RDS. The definition here
# provides a nice roll-up of settings that are important to manage. See the
# `rds` module for all the guts of how this is implemented in detail.
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
    # FIXME: remove all but the bastion here once services are using the new
    # output security group from the database.
    aws_security_group.api_server_tasks.id,
    aws_security_group.cron_job_tasks.id,
    aws_security_group.bastion_security_group.id
  ])
}
