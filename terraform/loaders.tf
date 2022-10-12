# Data Loaders
#
# Each laoder run as a script on a schedule. They are responsible for loading
# data from a particular type of source (e.g. the CVS SMART Scheduling Links
# API, the PrepMod API), reformatting that data for UNIVAF, and posting it to
# the server's `/update` endpoint to be saved.

locals {
  # Sets up the unique fields for each loader. The keys of this map are the
  # source names (e.g. the argument to the loader script indicating which
  # source to pull), and the value can contain a `schedule` and `env_vars`.
  loader = {
    njvss = {
      schedule = "rate(5 minutes)"
      env_vars = {
        NJVSS_AWS_KEY_ID     = var.njvss_aws_key_id
        NJVSS_AWS_SECRET_KEY = var.njvss_aws_secret_key
      }
    },

    waDoh = { schedule = "rate(5 minutes)" }

    # FIXME: fill in definitions for additional loaders if this works
  }
}

module "source_loader" {
  for_each = local.loader

  source = "./modules/loader"

  name          = each.key
  schedule      = each.value.schedule
  loader_source = each.key
  api_url       = "http://${aws_alb.main.dns_name}"
  api_key       = var.api_keys[0]
  sentry_dsn    = var.loader_sentry_dsn
  env_vars      = lookup(each.value, "env_vars", {})
  loader_image  = "${aws_ecr_repository.loader_repository.repository_url}:${var.loader_release_version}"

  cluster_arn = aws_ecs_cluster.main.arn
  role        = aws_iam_role.ecs_task_execution_role.arn
  subnets     = aws_subnet.private.*.id
}
