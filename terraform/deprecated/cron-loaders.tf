# Data Loaders
#
# The loader is a script that reads data from various sources (e.g. Walgreens,
# PrepMod, the CDC), transforms the data into UNIVAF's format, and sends it to
# the API server to store in the database. These are basically ETL jobs.
#
# To run it on ECS, we define a separate task that runs the loader for each
# data source on a given schedule (it's possible to run multiple sources at
# once, but keeping them as separate tasks makes management a little easier).
# Some sources have additional CLI options or environment variables (e.g. API
# keys relevant to that source).

locals {
  # Define the loader tasks. The keys name the task, and the values are a map
  # that can have:
  # - `schedule` (required) a `cron()` or `rate()` expression for when to run.
  # - `env_vars` a map of extra environment variables to set.
  # - `options` list of extra CLI options to pass to the loader.
  # - `sources` list of sources to load. If not set, the key will be used.
  #     For example, these listings are the same:
  #       njvss = { schedule = "rate(5 minutes)" }
  #       njvss = { schedule = "rate(5 minutes)", sources = ["njvss"] }
  loaders = {
    njvss = {
      schedule = "rate(15 minutes)"
      env_vars = {
        NJVSS_AWS_KEY_ID     = var.njvss_aws_key_id
        NJVSS_AWS_SECRET_KEY = var.njvss_aws_secret_key
      }
    },
    waDoh             = { schedule = "cron(3/30 * * * ? *)" }
    cvsSmart          = { schedule = "cron(3/15 * * * ? *)" }
    walgreensSmart    = { schedule = "cron(2/15 * * * ? *)" }
    albertsonsScraper = { schedule = "cron(20/30 * * * ? *)" }
    hyvee             = { schedule = "cron(8/15 * * * ? *)" }
    heb               = { schedule = "cron(1/15 * * * ? *)" }
    cdcApi = {
      schedule = "cron(0 0,12 * * ? *)"
      # CDC updates are often slow; set stale threshold to 3 days.
      options = ["--stale-threshold", "172800000"]
    }
    riteAidScraper = { schedule = "cron(5/30 * * * ? *)" }
    riteAidApi = {
      schedule = "cron(0/15 * * * ? *)"
      env_vars = {
        RITE_AID_URL = var.rite_aid_api_url
        RITE_AID_KEY = var.rite_aid_api_key
      }
    }
    prepmod = {
      schedule = "cron(9/15 * * * ? *)"
      options  = ["--states", "AK,WA", "--hide-missing-locations"]
    }

    # Kroger appears to have shut things off entirely. We just want to run them
    # enough to know if they start working again.
    krogerSmart = { schedule = "cron(0 1/6 * * ? *)" }
  }
}

module "source_loader" {
  source   = "./modules/task"
  for_each = local.loaders

  depends_on = [aws_alb.main]

  name = each.key
  command = concat(
    ["--filter-stale-data"],
    lookup(each.value, "options", []),
    lookup(each.value, "sources", [each.key]),
  )
  env_vars = merge({
    # NOTE: loaders go directly to the API load balancer, not CloudFront.
    API_URL = (
      local.api_internal_domain != ""
      ? "https://${local.api_internal_domain}"
      : "http://${aws_alb.main.dns_name}"
    )
    API_KEY         = var.api_keys[0]
    API_CONCURRENCY = "5"
    DD_API_KEY      = var.datadog_api_key
    SENTRY_DSN      = var.loader_sentry_dsn
  }, lookup(each.value, "env_vars", {}))
  image = "${aws_ecr_repository.loader_repository.repository_url}:${var.loader_release_version}"
  role  = aws_iam_role.ecs_task_execution_role.arn

  # Only certain CPU/Memory combinations are allowed. See:
  # https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html#fargate-tasks-size
  cpu    = 256
  memory = 512
}

module "source_loader_schedule" {
  source   = "./modules/schedule"
  for_each = local.loaders

  schedule    = each.value.schedule
  task        = module.source_loader[each.key]
  cluster_arn = aws_ecs_cluster.main.arn
  # Loaders do a lot of traffic getting data from external sources on the public
  # internet, so they run in our "public" network with an internet gateway.
  subnets         = aws_subnet.public.*.id
  security_groups = [aws_security_group.cron_job_tasks.id]
}