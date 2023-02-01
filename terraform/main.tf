terraform {
  required_version = "~> 1.3.2"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.52"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
