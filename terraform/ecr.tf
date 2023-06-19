# ECR (Elastic Container Registry)
#
# All our code is run as tasks on ECS, which means they need repositories to
# store the container images. Images are built and published to these
# repositories by GitHub Actions.

locals {
  ecr_keep_10_images_policy = <<EOF
    {
      "rules": [
        {
          "rulePriority": 1,
          "description": "Keep last 10 images",
          "selection": {
            "tagStatus": "any",
            "countType": "imageCountMoreThan",
            "countNumber": 10
          },
          "action": {
            "type": "expire"
          }
        }
      ]
    }
  EOF
}

resource "aws_ecr_repository" "server_repository" {
  name                 = "univaf-server"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = false
  }
}

resource "aws_ecr_lifecycle_policy" "server_repository" {
  repository = aws_ecr_repository.server_repository.name
  policy     = local.ecr_keep_10_images_policy
}

resource "aws_ecr_repository" "loader_repository" {
  name                 = "univaf-loader"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = false
  }
}

resource "aws_ecr_lifecycle_policy" "loader_repository" {
  repository = aws_ecr_repository.loader_repository.name
  policy     = local.ecr_keep_10_images_policy
}

# This repository is maintained only for historical reference. The seed image
# should not actually ever be used in production.
resource "aws_ecr_repository" "seed_repository" {
  name                 = "univaf-db-seed"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = false
  }
}

resource "aws_ecr_lifecycle_policy" "seed_repository" {
  repository = aws_ecr_repository.seed_repository.name
  policy     = local.ecr_keep_10_images_policy
}
