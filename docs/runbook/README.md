# Runbook: Deployment & Operations Guide

Documents in this folder are a general guide to manipulating and maintaining the [getmyvax.org](https://getmyvax.org) deployment of this software. Since this project is open-source, some things are described in general terms, and you may need to look elsewhere or ask other project members on Slack for details like server addresses, resource names, credentials, etc.

- [General Overview](#general-overview)
    - [AWS](#aws)
    - [Other Services](#other-services)
- [Deployment](#deployment)
    - [Building](#building)
    - [Deploying New Images](#deploying-new-images)
- [Bastion Server](#bastion-server)


## General Overview

### AWS

Most of the infrastructure and services that support this project are in Amazon Web Services (AWS), and the vast majority of our AWS resources are in the `us-west-2` region. We try to maintain as much configuration as reasonably possible in *Terraform* configuration files in the [`terraform`](../../terraform) directory (we use *Terraform Cloud* to actually apply those configurations to AWS; see "other services").

Major components:

- Most code runs in ECS as Docker containers.
- CloudFront is used as a caching proxy in front of the API server.
- The database is managed in RDS.
- Historical log data is saved and made publicly accessible in S3.

As much of the infrastructure as possible is managed in Terraform, but a few bits are set up manually:

- Domain name in Route53.
- Bastion server and its associated security group in EC2.


### Other Services

We also rely on a handful of other services for critical operations tasks:

- [Terraform Cloud][terraform-cloud] manages checking and applying our Terraform configurations.
- Errors are tracked in [Sentry][sentry].


## Deployment

### Building

Because most of our code runs as Docker containers in ECS tasks, deploying new code requires first building and uploading Docker images to AWS ECR. We have GitHub Actions configured to automatically build images on every push in the [`ci` workflow][workflow-ci] (see the [logs in the "actions" tab][workflow-ci-runs]).

Images are tagged with the hash of the git commit they were built from, e.g. `appointment-server:bd2834bdc6dc09f5e925a407f883e838130ae5bc` is the API server image built from commit `bd2834bdc6dc09f5e925a407f883e838130ae5bc`. Images built from the `main` branch are *also* tagged with `latest`.


### Deploying New Images

**The loaders** always run the `latest` image, so once a commit has landed on the `main` branch and been built, the next loader run will use it.

**The API server** is configured to use a specific commit hash, so you must update and manually apply the Terraform configuration in order to deploy. This helps ensure that Terraform configurations stay in sync with the image being deployed.

After merging a PR into the `main` branch, you can deploy via the following steps:

1. Wait for the `ci` workflow to finish so that the new image is actually available to be deployed.
2. Update the Terraform configurations by running `scripts/deploy_infra.sh` from the root directory of the repo. This will alter the Terraform configuration and create a new commit.
3. `git push` the new commit to GitHub.
4. In Terraform Cloud, click "see details" on the latest run, and review the plan it shows to ensure it makes sense.
5. In Terraform Cloud, click the confirm button to apply the plan.

**The Demo UI** just runs as a GitHub pages site, and is automatically updated via the [`ui-deploy` workflow][workflow-ui-deploy] every time a commit lands on the `main` branch. You can view it at https://usdigitalresponse.github.io/appointment-availability-infra/.


## Bastion Server

Most of our services in AWS are in VPCs without public access, so if you need to log directly into a server, the database, or something else, you’ll need to do it through the [bastion server][bastion-server]. You can SSH into the bastion from a computer on the public internet, and from there run any commands that need access to our internal services, like using `psql` to log directly into the database.

In general, you should try to find a way to do most tasks that doesn't require manual intervention through the bastion, but it’s there when you absolutely need it or when there’s an emergency.

Please see another maintainer or the AWS console for the bastion’s IP address, SSH keys, etc.

Usually, you’ll log in via SSH:

```sh
$ ssh -i ~/.ssh/<your-keyfile> <user>@<bastion-ip-address>
```

And then run any commands you'd like from inside the SSH session.


[terraform-cloud]: https://app.terraform.io/
[sentry]: https://sentry.io/
[bastion-server]: https://en.wikipedia.org/wiki/Bastion_host
[workflow-ci]: ../../.github/workflows/ci.yml
[workflow-ci-runs]: https://github.com/usdigitalresponse/appointment-availability-infra/actions/workflows/ci.yml
[workflow-ui-deploy]: ../../.github/workflows/ui-deploy.yml
