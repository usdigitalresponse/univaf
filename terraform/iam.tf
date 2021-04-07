# ECS task execution role data
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

data "aws_iam_policy_document" "ecs_task_additional_permissions" {
  version = "2012-10-17"
  statement {
    sid     = "1"
    effect  = "Allow"
    actions = ["ecs:RunTask", "iam:PassRole"]
    resources = [
      "*" # todo lock this down
    ]
  }
}

# ECS task execution role
resource "aws_iam_role" "ecs_task_execution_role" {
  name               = var.ecs_task_execution_role_name
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_role.json
}

# ECS task execution role policy attachment
resource "aws_iam_role_policy_attachment" "ecs_task_execution_role" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ECS task execution role policy attachment
resource "aws_iam_policy" "ecs_runtask_policy" {
  name   = "runtask_policy"
  path   = "/"
  policy = data.aws_iam_policy_document.ecs_task_additional_permissions.json
}

resource "aws_iam_role_policy_attachment" "ecs_runtask_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = aws_iam_policy.ecs_runtask_policy.arn
}