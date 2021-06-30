# 2021-06-28: External ID Migration

## Summary

As part of an effort to [support multiple external IDs][issue-188] for a given `system`, we decided to change the interal representation of `external_id`s for locations from an object (e.g. `{"system": "value"}`) to a list of lists (e.g. `[["system", "value"]]`). We phased this work into a few steps:

1. Change the internal representation and add the ability to send and receive values in the new format ([#206][pr-206])
2. Switch to the new representation by default while retaining the old format ([#253][pr-253])
3. Remove support for the old output format ([#249][pr-249])

However, we were overzealous on step 3 and also removed support for the old _input_ format, which caused issues because our loaders still use the previous format.

## Timeline

_(All times US/Pacific, 24-hour clock.)_

### 2021-06-28 13:59

Sentry posts alerts to Slack about a high error rate, and then posted an alert resolving it 3 minutes later.

### 2021-06-28 14:02

Sentry posts alerts to Slack about a high error rate, and then posted an alert resolving it 5 minutes later.

### 2021-06-28 14:09

Sentry posts alerts to Slack about a high error rate, and then posted an alert resolving it 5 minutes later.

### 2021-06-11 14:15

@jaronoff97 confirms high error rate in Datadog dashboard and flags @astonm's attention. We quickly diagnose the bug as being related to the recent
deploy of the latest phase of the `external_id` format changeover.

### 2021-06-11 14:24

@astonm deploys code to revert to the previous behavior while preparing a fix for the bug after a quick review from @jaronoff97. The error rates as observed on Sentry and Datadog subsequently drop back to zero.

### 2021-06-11 17:05

@astonm deploys code to restore the intended functionality for phase three, completing the migration to the new external ID format.

## Lessons

### What Went Well

-   Our alerting in Sentry worked reasonably well at alerting us to the issue.
-   We were able to resolve the issue relatively quickly.

### What Went Wrong

-   Despite careful planning for each phase of the migration, @astonm overlooked a critical piece of functionality in the final phase.
-   We also did not catch this relatively consequential bug in the code review process before deploy.
-   After deploying the code, we were not monitoring closely enough to catch the issue until after it had been reported multiple times.

## Action Items

-   In the future when dealing with sensitive code that may have breaking effects on the API:
    -   Add integration tests that exercise common loader/server interactions.
    -   More carefully test and review code before deploy.
    -   More closely monitor for errors after deploy.

## Responders

-   @astonm
-   @jaronoff97

[issue-188]: https://github.com/usdigitalresponse/appointment-availability-infra/issues/188
[pr-206]: https://github.com/usdigitalresponse/appointment-availability-infra/pull/206
[pr-253]: https://github.com/usdigitalresponse/appointment-availability-infra/pull/253
[pr-249]: https://github.com/usdigitalresponse/appointment-availability-infra/pull/249
