# Terraform Configuration

While most of UNIVAF’s services are hosted in [Render](https://render.com), we use AWS for some things (e.g. historical data for analysis in an S3 bucket). The Terraform configuration files in this directory manage those AWS resources. Wherever possible, we try to manage AWS resources in code so they are understandable and reproducible.

UNIVAF used to be deployed entirely within AWS and the configuration here was much more extensive. Some things in this directory are legacy data from that time, and we may eventually delete them. A copy of of our previous production configurations for AWS is housed in [`terraform/deprecated`](./deprecated/) — feel free to peruse them if you need examples for how to set up UNIVAF on AWS.

For more on Terraform configuration files, check out the [reference docs](https://www.terraform.io/intro).
