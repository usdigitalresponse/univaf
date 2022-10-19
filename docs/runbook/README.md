# Runbook: Deployment & Operations Guide

Documents in this folder are a general guide to manipulating and maintaining the [getmyvax.org](https://getmyvax.org) deployment of this software. Since this project is open-source, some things are described in general terms, and you may need to look elsewhere or ask other project members on Slack for details like server addresses, resource names, credentials, etc.

- [General Overview](#general-overview)
    - [AWS](#aws)
    - [Other Services](#other-services)
- [Deployment](#deployment)
    - [Building](#building)
    - [Deploying New Images](#deploying-new-images-to-aws)
- [Bastion Server](#bastion-server)


## General Overview

### AWS

Most of the infrastructure and services that support this project are hosted in Amazon Web Services (AWS) in the `us-west-2` region. We try to maintain as much configuration as reasonably possible in *Terraform* configuration files in the [`terraform`](../../terraform) directory and we use *Terraform Cloud* to actually apply those configurations to AWS (see "other services").

Major components:

- Most code runs in Elastic Container Service (ECS) as Docker containers. Everything runs in a single ECS *cluster*.
    - The main concept in ECS is a *task*, which you can generally think of as Docker container.
    - The API server is an ECS *service* (named `api`). A *service* is a set of long-running tasks that ECS keeps a certain number of instances running (so if one stops, ECS starts a new one, and keeps N copies running where N scales between an upper and lower limit based on resource usage).
    - Most other code runs as *scheduled tasks* in the same clauser as the API service. A *scheduled task* isn't actually a built-in feature of ECS, but is a well-known pattern — it's a *CloudWatch event* that is triggered on a schedule and that tells the ECS cluster to run a particular *task* — basically `cron` for Docker containers. Terraform is incredibly helpful by letting us make this pattern into a single, manageable configuration object.
        - Each loader source (e.g. `albertsons`, `krogerSmart`, `walgreensSmart`) is a separate task (see [`terraform/loaders.tf`](../../terraform/loaders.tf)). This lets us control the schedule and arguments for each source we pull data from in an organized way.
        - Other scheduled tasks are part of the `server` code and support its functions. For example, the `daily_data_snapshot_task` dumps a copy of the database each night into S3 as JSON files that are used for historical analysis.
- CloudFront is used as a caching proxy in front of the API server.
- The database is managed in RDS.
- Historical log data is saved and made publicly accessible in S3. (A scheduled task in ECS runs nightly and is responsible for this.)

As much of the infrastructure as possible is managed in Terraform, but a few bits are set up manually:

 - SSL certificate in ACM. (The actual DNS records are managed in Terraform, though.)
 - Bastion server and its associated security group in EC2.


### Other Services

We also rely on a handful of other services for critical operations tasks:

- **[Terraform Cloud][terraform-cloud]** manages checking and applying our Terraform configurations.
- **GitHub actions** works in concert with Terraform Cloud to automatically deploy changes that land on the `main` branch.
    - The `ci` workflow publishes docker images to Amazon ECR.
    - The `ui-deploy` workflow builds the UI and publishes it to GitHub pages (see below).
- **[Sentry][sentry]** tracks exceptions in our code. It also tracks warnings about unexpected content in the data we pull in from external sources (e.g. a new, unknown vaccine code), which is critical to keeping the service up-to-date and accurate.
- **[DataDog][]** for general stats on our services. The most imporant of these is usually metrics on HTTP requests. Sometimes the server may be rejecting bad requests with a 4xx status code, and the dashboards in DataDog are the best place to see that happening since they might not trigger exceptions or other kinds of alerts.
- **[1Password][1pw]** stores Important team and partner credentials in a shared *vault*.
- **GitHub pages** hosts the demo UI at https://usdigitalresponse.github.io/univaf/. However, we don’t generally point everyday residents to this URL and are not aware of anybody using it in a production capacity — it’s intended a demonstration and testing tool for API consumers.
- **[Slack][slack-usdr]** for team communication. We have two channels in USDR’s Slack:
    - One for team discussion
    - One for errors and alerts from the above services. When there’s an incident, the alerts channel is usually how we find out about it. We typically start a thread based on the alert that was posted to the channel, so if you are looking for live discussion of an ongoing problem, check there first.

Please get in touch with a project lead for access to any of these systems.


## Deployment

### Build & Deploy

**Most production code runs as Docker containers in ECS tasks.** Deploying new code requires two steps:

1. Building and uploading Docker images to AWS ECR (Elastic Container Registry).
    - GitHub Actions does this automatically on every push the `main` branch. See the [`ci` workflow][workflow-ci] for details and see the [logs in the "actions" tab][workflow-ci-runs]).

    - Images are tagged with the hash of the git commit they were built from, e.g. `univaf-server:bd2834bdc6dc09f5e925a407f883e838130ae5bc` is the API server image built from commit `bd2834bdc6dc09f5e925a407f883e838130ae5bc`. *(NOTE: we used to publish a `latest` tag, but no longer do so.)*

2. Updating AWS to use the images from step 1 using Terraform.
    - GitHub Actions automatically runs the `scripts/deploy_infra.sh` script after publishing images. It updates the Terraform configuration to use the new images and commits the result.

    - Terraform Cloud automatically picks up the change and updates ECS configurations to use the new images.

**AWS configuration changes deploy automatically via Terraform Cloud.** Every time a new commit that changes Terraform files lands on the `main` branch, Terraform Cloud will deploy. It will also *plan* a deployment (and tell you what it would create/update/destroy) every time you push to a Pull Request branch (this will show up as a “check” at the bottom of a PR).

If you need to trigger Terraform manually, log into [Terraform Cloud][terraform-cloud], browse to the “univaf-infra” workspace, click the “actions” dropdown in the upper-right, and select “start new run.”

![Manually deploying in Terraform Cloud](../_assets/terraform-manual-deploy.png)

**The Demo UI is a static site built with Webpack.** We use GitHub Actions to automatically build and publish the site. The [`ui-deploy` workflow][workflow-ui-deploy] automatically builds and deploys the site every time a commit lands on the `main` branch. See the main README for details on [building the static site manually](../../README.md#building-and-viewing-the-ui).


### Terraforming Locally

In order to run terraform locally, you have to auth `terraform` to terraform cloud. This requires a cloud invite; reach out to the project owners to get an invite. Once you clone the repository locally, navigate to the `terraform/` directory in your preferred shell. Run `terraform login`, which will create an API access token for you. You'll be prompted to paste it in to your shell in order to access it. Initialize to the backend using `terraform init`. At this point, you will be able to run terraform commands as expected: `terraform plan`, `terraform apply`, `terraform state list`, etc.

**Please avoid running commands that change Terraform’s state locally (e.g. `terraform apply`) and instead run them in Terraform Cloud.** If you absolutely need to modify state locally, coordinate with the rest of the team by following the instructions below.

### Terraforming changes that require manual state intervention

Terraform plans and applies changes based on a saved *state* that should reflect the actual resources that exist in AWS. Modifying state by applying Terraform changes locally instead of on Terraform Cloud will cause Terraform Cloud to start working based on stale data, and potentially create plans that don’t actually work, which means new changes cannot be deployed!

Follow this process when making any changes in terraform that may affect another person's work.

1. Provide advance notice that this work would affect live TF/infra state outside just the code, and therefore bleed into any other things going on in parallel.
2. Break out the parts that can be done advance of the above stuff and that can follow the normal path for doing things in code.
3. Plan for when to do the work, giving an explicit time window for the changes so others on the team can be aware and avoid doing things that collide with it.
4. Inform team members so they know you’ll be needing immediate review on some PRs.
5. Give clear notification when you are starting and ending that work, so the rest of the team can act appropriately.


## Bastion Server

Most of our services in AWS are in VPCs without public access, so if you need to log directly into a server, the database, or something else, you’ll need to do it through the [bastion server][bastion-server]. You can SSH into the bastion from a computer on the public internet, and from there run any commands that need access to our internal services, like using `psql` to log directly into the database.

In general, you should try to find a more automatic or managed way to do most tasks (by running a task on ECS, using a database migration file, etc.) instead of manual intervention through the bastion, but it’s there when you absolutely need it or when there’s an emergency.

Please see another maintainer or the AWS console for the bastion’s IP address, SSH keys, etc.

Usually, you’ll log in via SSH:

```sh
$ ssh -i ~/.ssh/<your-keyfile> <user>@<bastion-ip-address>
```

And then run any commands you'd like from inside the SSH session.


[terraform-cloud]: https://app.terraform.io/
[sentry]: https://sentry.io/
[datadog]: https://www.datadoghq.com/
[1pw]: https://1password.com/
[slack-usdr]: https://usdigitalresponse.slack.com/
[bastion-server]: https://en.wikipedia.org/wiki/Bastion_host
[terraform-aws-provider]: https://registry.terraform.io/providers/hashicorp/aws/latest/docs
[workflow-ci]: ../../.github/workflows/ci.yml
[workflow-ci-runs]: https://github.com/usdigitalresponse/univaf/actions/workflows/ci.yml
[workflow-ui-deploy]: ../../.github/workflows/ui-deploy.yml
