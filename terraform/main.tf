terraform {
  required_version = "~> 1.3.2"

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # We use a module that is not yet compatible with v5 of the AWS provider:
      # https://github.com/cloudposse/terraform-aws-cloudfront-s3-cdn/issues/279
      version = "~> 4.52"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
