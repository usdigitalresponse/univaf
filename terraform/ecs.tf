# Most UNIVAF code is deployed as tasks that run on this cluster, either as
# scheduled cron-like scheduled tasks that run to completion, or as services
# that the cluster will keep running.
resource "aws_ecs_cluster" "main" {
  name = "univaf-cluster"
}
