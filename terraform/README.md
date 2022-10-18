# Terraform Configuration

Most everything that is part of UNIVAF runs in AWS, and the configuration for pretty much everything is stored here as [Terraform][] code. Whenever these files are changed, Terraform Cloud (a Terraform as a service offering) will pick up on it and develop a plan for what needs to actually change in AWS and, if the commit is on the `main` branch, automatically apply those changes.

For more on Terraform configuration files, check out the [reference docs][terraform-docs].

[terraform]: https://www.terraform.io/
[terraform-docs]: https://www.terraform.io/intro
