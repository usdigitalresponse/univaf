

# module "cvs_scraper_loader" {
#   source = "./modules/loader"

#   name = "cvs-scraper"
#   loader_source = "cvsScraper"
#   api_url = "http://${aws_alb.main.dns_name}"
#   api_key = var.api_key
#   schedule = "rate(10 minutes)"
#   cluster_arn = aws_ecs_cluster.main.arn
#   role = aws_iam_role.ecs_task_execution_role.arn
#   subnets = aws_subnet.public.*.id
# }

module "cvs_api_loader" {
  source = "./modules/loader"

  name          = "cvs-api"
  loader_source = "cvsApi"
  api_url       = "http://${aws_alb.main.dns_name}"
  api_key       = var.api_key
  schedule      = "rate(3 minutes)"
  cluster_arn   = aws_ecs_cluster.main.arn
  role          = aws_iam_role.ecs_task_execution_role.arn
  subnets       = aws_subnet.public.*.id
  env_vars = {
    CVS_API_URL = "https://api.cvshealth.com/"
    CVS_API_KEY = var.cvs_api_key
  }
}

module "njvss_loader" {
  source = "./modules/loader"

  name          = "njvss"
  loader_source = "njvss"
  api_url       = "http://${aws_alb.main.dns_name}"
  api_key       = var.api_key
  schedule      = "rate(3 minutes)"
  cluster_arn   = aws_ecs_cluster.main.arn
  role          = aws_iam_role.ecs_task_execution_role.arn
  subnets       = aws_subnet.public.*.id
  env_vars = {
    NJVSS_AWS_KEY_ID     = var.njvss_aws_key_id
    NJVSS_AWS_SECRET_KEY = var.njvss_aws_secret_key
  }
}

module "vaccinespotter_loader" {
  source = "./modules/loader"

  name          = "vaccinespotter"
  command       = ["--states", "CO,NJ"]
  loader_source = "vaccinespotter"
  api_url       = "http://${aws_alb.main.dns_name}"
  api_key       = var.api_key
  schedule      = "rate(2 minutes)"
  cluster_arn   = aws_ecs_cluster.main.arn
  role          = aws_iam_role.ecs_task_execution_role.arn
  subnets       = aws_subnet.public.*.id
}
