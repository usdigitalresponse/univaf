# ECS Cluster
#
# Most UNIVAF code is deployed as tasks that run on an ECS cluster, either as
# scheduled cron-like scheduled tasks that run to completion, or as services
# that the cluster will keep running. This file defines the cluster and
# associated roles/policies needed to run tasks in it.

resource "aws_ecs_cluster" "main" {
  name = "univaf-cluster"
}


# Roles -----------------------------------------------------------------------

# Things that need to execute tasks in the ECS cluster should use this role.
resource "aws_iam_role" "ecs_task_execution_role" {
  # TODO: consider using jsonencode and/or `inline_policy` blocks to put policy
  #       definitions inline: https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role
  name               = "univaf-ecs-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_role.json
}

# Gives the role access to things needed to execute tasks. The policy referenced
# here is predefined by Amazon.
resource "aws_iam_role_policy_attachment" "ecs_task_execution_role" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Gives the role the ability to run actual tasks.
resource "aws_iam_role_policy_attachment" "ecs_runtask_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = aws_iam_policy.ecs_runtask_policy.arn
}


# Policies used in the role/attachments above ---------------------------------

# Defines what resources are allowed to assume a given role.
data "aws_iam_policy_document" "ecs_task_execution_role" {
  version = "2012-10-17"
  statement {
    sid     = "1"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com", "events.amazonaws.com"]
    }
  }
}

# Defines the ability to run a task in ECS.
data "aws_iam_policy_document" "ecs_task_additional_permissions" {
  version = "2012-10-17"
  statement {
    sid     = "1"
    effect  = "Allow"
    actions = ["ecs:RunTask", "iam:PassRole"]
    resources = [
      "*" # TODO: lock this down
    ]
  }
}
resource "aws_iam_policy" "ecs_runtask_policy" {
  name   = "runtask_policy"
  path   = "/"
  policy = data.aws_iam_policy_document.ecs_task_additional_permissions.json
}
