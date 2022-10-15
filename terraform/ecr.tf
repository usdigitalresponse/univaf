# ECR (Elastic Container Registry)
#
# All our code is run as tasks on ECS, which means they need repositories to
# store the container images. Images are built and published to these
# repositories by GitHub Actions.

resource "aws_ecr_repository" "server_repository" {
  name                 = "univaf-server"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = false
  }
}

resource "aws_ecr_repository" "loader_repository" {
  name                 = "univaf-loader"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = false
  }
}

# This repository is maintained only for historical reference. The seed image
# should not actually ever be used in production.
resource "aws_ecr_repository" "seed_repository" {
  name                 = "univaf-db-seed"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = false
  }
}
