# Daily Data Snapshot Cron Job
#
# The "daily data snapshot" task runs once a day to archive the contents of the
# database and update logs to S3 so others can do historical analysis.

module "daily_data_snapshot_task" {
  source = "./modules/task"

  name    = "daily-data-snapshot"
  image   = "${aws_ecr_repository.server_repository.repository_url}:${var.api_release_version}"
  command = ["node", "dist/scripts/availability_dump.js", "--write-to-s3", "--clear-log"]
  role    = aws_iam_role.ecs_task_execution_role.arn

  env_vars = {
    DB_HOST                 = module.db.host
    DB_NAME                 = module.db.db_name
    DB_USERNAME             = var.db_user
    DB_PASSWORD             = var.db_password
    SENTRY_DSN              = var.api_sentry_dsn
    DATA_SNAPSHOT_S3_BUCKET = var.data_snapshot_s3_bucket
    AWS_ACCESS_KEY_ID       = var.data_snapshot_aws_key_id
    AWS_SECRET_ACCESS_KEY   = var.data_snapshot_aws_secret_key
    AWS_DEFAULT_REGION      = var.aws_region
  }
}

module "daily_data_snapshot_schedule" {
  source = "./modules/schedule"

  schedule        = "cron(0 1 * * ? *)"
  task            = module.daily_data_snapshot_task
  cluster_arn     = aws_ecs_cluster.main.arn
  subnets         = aws_subnet.public.*.id
  security_groups = [aws_security_group.cron_job_tasks.id, module.db.access_group_id]
}
