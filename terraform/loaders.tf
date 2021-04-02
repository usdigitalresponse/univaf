

module "cvs_scraper_loader" {
  source = "./modules/loader"

  name = "cvs-scraper"
  loader_source = "cvsScraper"
  api_url = "http://${aws_alb.main.dns_name}"
  api_key = var.api_key
  schedule = "rate(10 minutes)"
  cluster_arn = aws_ecs_cluster.main.arn
  role = aws_iam_role.ecs_task_execution_role.arn
}