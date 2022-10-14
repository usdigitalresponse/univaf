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
  # Define the unique parts of each task. The keys of this map are the
  # source names (e.g. the argument to the loader script indicating which
  # source to load), and the value is a map with other task arguments that
  # should be set specially for that source.
  loader = {
    njvss = {
      schedule = "rate(5 minutes)"
      env_vars = {
        NJVSS_AWS_KEY_ID     = var.njvss_aws_key_id
        NJVSS_AWS_SECRET_KEY = var.njvss_aws_secret_key
      }
    },
    waDoh          = { schedule = "cron(3/5 * * * ? *)" }
    cvsSmart       = { schedule = "cron(0/10 * * * ? *)" }
    walgreensSmart = { schedule = "cron(2/10 * * * ? *)" }
    krogerSmart    = { schedule = "cron(4/10 * * * ? *)" }
    albertsons     = { schedule = "cron(6/10 * * * ? *)" }
    hyvee          = { schedule = "cron(8/10 * * * ? *)" }
    heb            = { schedule = "cron(1/10 * * * ? *)" }
    cdcApi         = { schedule = "cron(0 0,12 * * ? *)" }
    riteAidScraper = { schedule = "cron(0/10 * * * ? *)" }
    riteAidApi = {
      schedule = "cron(0/30 * * * ? *)"
      command  = ["--states", "CA,CT,DE,ID,MA,MD,MI,NH,NJ,NV,NY,OH,OR,PA,VA,VT,WA"]
      env_vars = {
        RITE_AID_URL = var.rite_aid_api_url
        RITE_AID_KEY = var.rite_aid_api_key
      }
    }
    prepmod = {
      schedule = "cron(9/10 * * * ? *)"
      command  = ["--states", "AK,WA", "--hide-missing-locations"]
    }
  }
}

module "source_loader" {
  for_each = local.loader

  source = "./modules/loader"

  name          = each.key
  schedule      = each.value.schedule
  loader_source = each.key
  command       = lookup(each.value, "command", [])
  # NOTE: loaders go directly to the API service load balancer, not CloudFront.
  api_url    = "http://${aws_alb.main.dns_name}"
  api_key    = var.api_keys[0]
  sentry_dsn = var.loader_sentry_dsn
  env_vars = merge(
    { DD_API_KEY = var.datadog_api_key },
    lookup(each.value, "env_vars", {})
  )
  loader_image = "${aws_ecr_repository.loader_repository.repository_url}:${var.loader_release_version}"

  cluster_arn = aws_ecs_cluster.main.arn
  role        = aws_iam_role.ecs_task_execution_role.arn
  subnets     = aws_subnet.private.*.id
}
