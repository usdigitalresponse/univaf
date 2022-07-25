# Container Registries
#
# These registries are maintained for historical reference and to make
# re-deployment on AWS easier. We may eventually delete them.

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
