# Terraform Configuration

The production UNIVAF service at [getmyvax.org](https://getmyvax.org) was shut down on June 15, 2023. The remaining configuration code here supports historical archives and a shutdown notice page. If you are planning to deploy your own copy of UNIVAF to AWS, you can use the former production Terraform code in the [`./deprecated`](./deprecated) folder as guide.

Whenever these files are changed, Terraform Cloud (a Terraform as a service offering) will pick up on it and develop a plan for what needs to actually change in AWS and, if the commit is on the `main` branch, automatically apply those changes.

For more on Terraform configuration files, check out the [reference docs][terraform-docs].

[terraform]: https://www.terraform.io/
[terraform-docs]: https://www.terraform.io/intro
