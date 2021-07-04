# 2021-06-29: Broken Deploys with No Actions Budget and Bad Terraform State

## Summary

Our normal deploy process was blocked by a combination of GitHub Actions billing issues (which meant none of our Actions Workflows could run) and out-of-sync state data in Terraform Cloud (meaning we could not deploy using it). These two issues delayed a [hotfix for NDJSON functionality (#275)][issue-275] for several hours.

**This incident was severe enough to be worth a report here, but service was never unavailable. The primary result was that deploys became slow (hours instead of minutes) and unsafe.**

The first issue blocked deployment because we use GitHub actions to build and upload our Docker images. Luckily, the same Docker commands can be performed manually, so @Mr0grog was able to workaround that issue to build the hotfix. However, that didn’t fix the fact that actions are still not running, meaning we have no automated testing or building. We’ll only deploy emergency hotfixes until the underlying issue is resolved. *(Update: this was resolved the morning of 2021-06-30)*

However, the second issue with Terraform was a much bigger problem. It turns out that @jaronoff97 used the `terraform import` command while working on [adding our bastion server’s security group to the Terraform configuration files (#274)][issue-274]. Unfortunately, `terraform import` modifies the *state* that Terraform uses to plan changes against. Since the corresponding config files were still on @jaronoff97’s pull request branch, that meant the Terraform config files on `main` and all other branches were out of sync with with our Terraform *state*, causing Terraform to plan to destroy important resources in AWS whenever trying to deploy from any branch except @jaronoff97’s pull request.

Terraform Cloud keeps track of past versions of the state, but does not make it possible to roll back or revert to a particular state version. However, @Mr0grog was able to use Terraform Cloud’s API to download the last in-sync state and re-set it as the latest state, resolving the issue. (Note this means @jaronoff97 has some extra work to do when finalizing [#274][issue-274].)

Both of these issues stem from poor coordination and lack of a clear process around infrastructure management, and we definitely need more work to come up with long-term solutions. (See [action items](#action-items) at the end of this report.)


## Timeline

*(All times US/Pacific, 24-hour clock.)*

### 2021-06-29 18:30

@Mr0grog completes hotfix [#275][issue-275], but discovers actions are not running and all our GitHub checks are failing. He starts trying to figure out what is going wrong and whether this is specific to our repo or a GitHub-wide problem.


### 2021-06-29 18:36

@Mr0grog posts a request for help in #team-ops-and-tools in case someone is with better access to the GitHub org account can figure out the issue more clearly. (@Mr0grog does not anticipate this will be very fruitful since it’s after hours, and there’s no clear ops on-call/escalation plan as far as he knows.)


### 2021-06-29 19:04

@Mr0grog realizes this is a billing issue. Error messages about payment failures are shown on below the fold on the workflow summary screen (not on individual job logs). @Mr0grog updates thread in #team-ops-and-tools with info and a more specific ask about payment.


### 2021-06-29 20:41

@Mr0grog gives up on resolving the billing issue and pings @jaronoff97 for help reviewing the hotfix since automated checks aren’t running.


### 2021-06-29 20:43

@jaronoff97 reviews the PR and @Mr0grog merges and starts building & uploading Docker images manually.


### 2021-06-29 21:14

@Mr0grog rebuilds and uploads on remote infrastructure. His home internet connection is too slow to upload the build Docker images with any reasonable speed.


### 2021-06-29 21:36

@Mr0grog tries to deploy new images via Terraform, but the Terraform plan shows that the bastion security group is going to be destroyed. @Mr0grog is no longer sure this deploy is safe, asks on Slack if @jaronoff97 knows what’s up, and starts digging into it.


### 2021-06-29 21:53

@Mr0grog discovers that Terraform’s state was altered several times outside of Terraform Cloud earlier in the evening by @jaronoff97. This seems most likely to be the cause of the issue, and is probably related to the [Terraform configuration changes in #274][issue-274]. @jaronoff97 appears to be offline for the night and is not responsive on Slack.


### 2021-06-29 22:32

After digging around online, @Mr0grog discovers how to manually change state via the Terraform API in this article: https://learn.hashicorp.com/tutorials/terraform/cloud-state-api

He downloads the state from the last deploy, modifies its sequence number, signs it, and uploads it as the new state via the API, then triggers a new plan from the `main` git branch in Terraform Cloud.


### 2021-06-29 22:34

The plan finishes and shows sensible output that isn’t destroying resources. @Mr0grog applies.


### 2021-06-29 22:40

Infrastructure in AWS is updated and hotfix is finally deployed.

The original bug @Mr0grog was trying to fix is resolved, but automatic builds are still broken. Terraform is back in a good state, but clarification on the exact cause and whether further cleanup is necessary is still needed from @jaronoff97 in the morning. @Mr0grog posts a quick summary and questions in Slack and goes to bed.

---

Post-resolution:

### 2021-06-30 06:17

@jaronoff confirms diagnosis and fix were correct, kicks off discussion about processes to avoid this in the future.


### 2021-06-30 06:17

@alexallain suggests posting about billing issues in #questions-tools instead of #team-ops-and-tools.


### 2021-06-30 10:33

@paulschreiber adds some credit to USDR GitHub account to get actions running again. Automated tests, builds, and Terraform deploys are all now functional again.


## Lessons

### What Went Well

- Building images manually was straightforward.
- @jaronoff was able to quickly review the hotfix when actions were not running.
- @M0grog was aware enough of [#274][issue-274] to identify it as a likely cause.


### What Went Wrong

- There’s no clear process for escalating ops issues at USDR, rather than just within project teams.

- @Mr0grog should have posted in #questions-tools instead of #team-ops-and-tools. (He was under the impression that #team- would be more likely to get quick responses, but reality is the other way around.)

- Project members had no visibility into the organization’s actions budget, how close they were to using available actions minutes, or that actions would abruptly be cut off if the budget was overrun.

- @jaronoff97 did not alert others that his work on [#274][issue-274] involved changes to the Terraform state, which would affect any other PRs or deploys happening in parallel. The description and comments on [#274][issue-274] did not call this out, either, leaving @Mr0grog uncertain as to whether his diagnosis of the core problem was correct and complete.


## Action Items

- Work with USDR ops team to fund GitHub effectively.
    - Turn actions back on for this project. **(Done as of 2021-06-30)**
    - Raise need for USDR to develop real budgeting, plans, and response process around usage of paid GitHub features. (Actually developing those is outside the scope of this project.)

- Document how to build manually.

- Document how to deploy manually without Terraform.

- Articulate a process for planning and handling Terraform changes that require out-of-band work to change production. This process should avoid having configuration files and Terraform state out-of-sync for extended periods of time, and ensure that team members are notified about situation ahead of time.


## Responders

- @Mr0grog


[issue-274]: https://github.com/usdigitalresponse/univaf/pull/274
[issue-275]: https://github.com/usdigitalresponse/univaf/pull/275
