# Data Loaders
#
# These each run as a script on a schedule. They are responsible for loading
# data from a particular type of source (e.g. the CVS SMART Scheduling Links
# API, the PrepMod API), reformatting that data for UNIVAF, and posting it to
# the server's `/update` endpoint to be saved.

module "cvs_smart_loader" {
  source = "./modules/loader"

  name          = "cvs-smart-api"
  loader_image  = "${aws_ecr_repository.loader_repository.repository_url}:${var.loader_release_version}"
  loader_source = "cvsSmart"
  command       = ["--states", "AL,AK,AZ,AR,CA,CO,CT,DE,DC,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,MH,PR,VI"]
  api_url       = "http://${aws_lb.main.dns_name}"
  api_key       = var.api_key
  sentry_dsn    = var.loader_sentry_dsn
  schedule      = "rate(5 minutes)"
  cluster_arn   = aws_ecs_cluster.main.arn
  role          = aws_iam_role.ecs_task_execution_role.arn
  subnets       = aws_subnet.public.*.id
}

module "njvss_loader" {
  source = "./modules/loader"

  name          = "njvss"
  loader_image  = "${aws_ecr_repository.loader_repository.repository_url}:${var.loader_release_version}"
  loader_source = "njvss"
  api_url       = "http://${aws_lb.main.dns_name}"
  api_key       = var.api_key
  sentry_dsn    = var.loader_sentry_dsn
  schedule      = "rate(5 minutes)"
  cluster_arn   = aws_ecs_cluster.main.arn
  role          = aws_iam_role.ecs_task_execution_role.arn
  subnets       = aws_subnet.public.*.id
  env_vars = {
    NJVSS_AWS_KEY_ID     = var.njvss_aws_key_id
    NJVSS_AWS_SECRET_KEY = var.njvss_aws_secret_key
  }
}

module "rite_aid_loader" {
  source = "./modules/loader"

  name          = "riteAidApi"
  loader_image  = "${aws_ecr_repository.loader_repository.repository_url}:${var.loader_release_version}"
  loader_source = "riteAidApi"
  // Our API key does not permit queries in CO, so it is missing from this list.
  command     = ["--states", "CA,CT,DE,ID,MA,MD,MI,NH,NJ,NV,NY,OH,OR,PA,VA,VT,WA"]
  api_url     = "http://${aws_lb.main.dns_name}"
  api_key     = var.api_key
  sentry_dsn  = var.loader_sentry_dsn
  schedule    = "rate(30 minutes)"
  cluster_arn = aws_ecs_cluster.main.arn
  role        = aws_iam_role.ecs_task_execution_role.arn
  subnets     = aws_subnet.public.*.id
  env_vars = {
    RITE_AID_URL = var.rite_aid_api_url
    RITE_AID_KEY = var.rite_aid_api_key
  }
}

module "rite_aid_scraper_loader" {
  source = "./modules/loader"

  name          = "riteAidScraper"
  loader_image  = "${aws_ecr_repository.loader_repository.repository_url}:${var.loader_release_version}"
  loader_source = "riteAidScraper"
  command       = ["--states", "CA,CO,CT,DE,ID,MA,MD,MI,NH,NJ,NV,NY,OH,OR,PA,VA,VT,WA"]
  api_url       = "http://${aws_lb.main.dns_name}"
  api_key       = var.api_key
  sentry_dsn    = var.loader_sentry_dsn
  schedule      = "cron(*/10 * * * ? *)"
  cluster_arn   = aws_ecs_cluster.main.arn
  role          = aws_iam_role.ecs_task_execution_role.arn
  subnets       = aws_subnet.public.*.id
}

module "walgreens_loader" {
  source = "./modules/loader"

  name          = "walgreensSmart"
  loader_image  = "${aws_ecr_repository.loader_repository.repository_url}:${var.loader_release_version}"
  command       = ["--states", "AL,AK,AZ,AR,CA,CO,CT,DE,DC,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,MH,PR,VI"]
  loader_source = "walgreensSmart"
  api_url       = "http://${aws_lb.main.dns_name}"
  api_key       = var.api_key
  sentry_dsn    = var.loader_sentry_dsn
  schedule      = "cron(2/10 * * * ? *)"
  cluster_arn   = aws_ecs_cluster.main.arn
  role          = aws_iam_role.ecs_task_execution_role.arn
  subnets       = aws_subnet.public.*.id
}

module "kroger_loader" {
  source = "./modules/loader"

  name          = "krogerSmart"
  loader_image  = "${aws_ecr_repository.loader_repository.repository_url}:${var.loader_release_version}"
  command       = ["--states", "AL,AK,AZ,AR,CA,CO,CT,DE,DC,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,MH,PR,VI"]
  loader_source = "krogerSmart"
  api_url       = "http://${aws_lb.main.dns_name}"
  api_key       = var.api_key
  sentry_dsn    = var.loader_sentry_dsn
  schedule      = "cron(4/10 * * * ? *)"
  cluster_arn   = aws_ecs_cluster.main.arn
  role          = aws_iam_role.ecs_task_execution_role.arn
  subnets       = aws_subnet.public.*.id
}

module "albertsons_loader" {
  source = "./modules/loader"

  name          = "albertsons"
  loader_image  = "${aws_ecr_repository.loader_repository.repository_url}:${var.loader_release_version}"
  command       = ["--states", "AL,AK,AZ,AR,CA,CO,CT,DE,DC,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,MH,PR,VI"]
  loader_source = "albertsons"
  api_url       = "http://${aws_lb.main.dns_name}"
  api_key       = var.api_key
  sentry_dsn    = var.loader_sentry_dsn
  schedule      = "cron(6/10 * * * ? *)"
  cluster_arn   = aws_ecs_cluster.main.arn
  role          = aws_iam_role.ecs_task_execution_role.arn
  subnets       = aws_subnet.public.*.id
}

module "hyvee_loader" {
  source = "./modules/loader"

  name          = "hyvee"
  loader_image  = "${aws_ecr_repository.loader_repository.repository_url}:${var.loader_release_version}"
  command       = ["--states", "AL,AK,AZ,AR,CA,CO,CT,DE,DC,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,MH,PR,VI"]
  loader_source = "hyvee"
  api_url       = "http://${aws_lb.main.dns_name}"
  api_key       = var.api_key
  sentry_dsn    = var.loader_sentry_dsn
  schedule      = "cron(0/10 * * * ? *)"
  cluster_arn   = aws_ecs_cluster.main.arn
  role          = aws_iam_role.ecs_task_execution_role.arn
  subnets       = aws_subnet.public.*.id
}

module "heb_loader" {
  source = "./modules/loader"

  name          = "heb"
  loader_image  = "${aws_ecr_repository.loader_repository.repository_url}:${var.loader_release_version}"
  command       = ["--states", "AL,AK,AZ,AR,CA,CO,CT,DE,DC,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,MH,PR,VI"]
  loader_source = "heb"
  api_url       = "http://${aws_lb.main.dns_name}"
  api_key       = var.api_key
  sentry_dsn    = var.loader_sentry_dsn
  schedule      = "cron(8/10 * * * ? *)"
  cluster_arn   = aws_ecs_cluster.main.arn
  role          = aws_iam_role.ecs_task_execution_role.arn
  subnets       = aws_subnet.public.*.id
}

module "washington_doh_loader" {
  source = "./modules/loader"

  name          = "waDoh"
  loader_image  = "${aws_ecr_repository.loader_repository.repository_url}:${var.loader_release_version}"
  command       = ["--states", "AL,AK,AZ,AR,CA,CO,CT,DE,DC,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,MH,PR,VI"]
  loader_source = "waDoh"
  api_url       = "http://${aws_lb.main.dns_name}"
  api_key       = var.api_key
  sentry_dsn    = var.loader_sentry_dsn
  schedule      = "rate(5 minutes)"
  cluster_arn   = aws_ecs_cluster.main.arn
  role          = aws_iam_role.ecs_task_execution_role.arn
  subnets       = aws_subnet.public.*.id
}

module "cdc_loader" {
  source = "./modules/loader"

  name          = "cdcApi"
  loader_image  = "${aws_ecr_repository.loader_repository.repository_url}:${var.loader_release_version}"
  loader_source = "cdcApi"
  command       = ["--states", "AL,AK,AZ,AR,CA,CO,CT,DE,DC,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,MH,PR,VI"]
  api_url       = "http://${aws_lb.main.dns_name}"
  api_key       = var.api_key
  sentry_dsn    = var.loader_sentry_dsn
  schedule      = "cron(0 0,12 * * ? *)"
  cluster_arn   = aws_ecs_cluster.main.arn
  role          = aws_iam_role.ecs_task_execution_role.arn
  subnets       = aws_subnet.public.*.id
}

module "vts_geo_loader" {
  source = "./modules/loader"

  name          = "vtsGeo"
  loader_image  = "${aws_ecr_repository.loader_repository.repository_url}:${var.loader_release_version}"
  loader_source = "vtsGeo"
  command       = ["--states", "AL,AK,AZ,AR,CA,CO,CT,DE,DC,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,MH,PR,VI"]
  api_url       = "http://${aws_lb.main.dns_name}"
  api_key       = var.api_key
  sentry_dsn    = var.loader_sentry_dsn
  schedule      = "cron(1 1 1 1 ? 1970)" # don't ever schedule a run
  cluster_arn   = aws_ecs_cluster.main.arn
  role          = aws_iam_role.ecs_task_execution_role.arn
  subnets       = aws_subnet.public.*.id
}

module "prepmod_loader" {
  source = "./modules/loader"

  name          = "prepmod"
  loader_image  = "${aws_ecr_repository.loader_repository.repository_url}:${var.loader_release_version}"
  command       = ["--states", "AK,WA", "--hide-missing-locations"]
  loader_source = "prepmod"
  api_url       = "http://${aws_lb.main.dns_name}"
  api_key       = var.api_key
  sentry_dsn    = var.loader_sentry_dsn
  schedule      = "rate(5 minutes)"
  cluster_arn   = aws_ecs_cluster.main.arn
  role          = aws_iam_role.ecs_task_execution_role.arn
  subnets       = aws_subnet.public.*.id
}
