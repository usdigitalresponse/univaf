# 2021-06-03: Database Full

## Summary

The new `availability_log` table filled up all remaining disk space on the database server, causing writes, and then eventually all new connections to fail. This effectively took down the entire service, since the API server could not even connect to the DB to read data.

We eventually resolved the emergency by expanding the database, but keeping the `availability_log` table from filling it up again is a follow-on problem that needs to be resolved soon. This also made clear that we need more and better alerting that warns us about things like low resources *before* we run out and that are highly visible to project members.


## Timeline

*(All times US/Pacific, 24-hour clock.)*

### 2021-06-03 9:00

@Mr0grog notices an e-mail from Sentry about a new error about database connections happening thousands of times. Checking the AWS RDS console shows that the database is out of space, and trying to connect directly via the bastion server shows it is no longer accepting new connections. We know `availability_log` would be becoming an issue soon, so it’s most likely it’s simply growing faste than expected.

### 2021-06-03 9:14

@Mr0grog posts message to Slack about the issue with a few ideas for fixing it. @astonm jumps in to give feedback and help out. They decide to start by restoring the latest backup to new DB server with more disk space in order to get the service unstuck.

### 2021-06-03 9:58

**Service is restored** by switching to the the backup. See [#169][issue-169].

### 2021-06-03 10:03

@Mr0grog and @astonm decide to increase disk space on the original database and work toward more correct, long-term fixes during the week before we run out of space again.

### 2021-06-03 12:26

@astonm completes and merges work on [#163][issue-163], which starts dumping the contents of the `availability_log` table to daily log files. Once that’s running, we can save space in the database by deleting old rows from `availability_log` since that data will be safely stored in S3.

### 2021-06-03 13:00

Original database is finished being upsized and the API service is switched back to it ([#172][issue-172]).

### 2021-06-03 13:18

@astonm adds CloudWatch alarms to database resources so we know when we are running low on resources before we run out entirely ([#171][issue-171]).

### 2021-06-03 15:29

@astonm deploys changes to run the S3 dumping script on a daily schedule ([#164][issue-164]). Automatic deletion of old logs from the `availability_log` table is turned off for now, though — we want to run this for a few days without error before we are confident deleting data from the database.


## Lessons

### What Went Well

- Sentry alerted us to the failures before someone else did.
- Logging and tooling made the cause extremely clear.
- Team was able to divide up work effectively.


### What Went Wrong

- @Mr0grog was the only one to see the alerts and it wasn't clear that the entire API was down until looking into it.
- The entire incident was a result of a problem we knew was coming, but did not keep a close eye on.


## Action Items

- Set up CloudWatch alarms for database resources. **(Done during this incident)**
- Set up Sentry alarms for high error rates.
- Set up Slack integrations so alerts are highly visible to the team.
- Set up automatic deletion of old logs before we hit database problems again.


## Responders

- @Mr0grog
- @astonm


[issue-163]: https://github.com/usdigitalresponse/univaf/issues/163
[issue-164]: https://github.com/usdigitalresponse/univaf/issues/164
[issue-169]: https://github.com/usdigitalresponse/univaf/issues/169
[issue-171]: https://github.com/usdigitalresponse/univaf/issues/171
[issue-172]: https://github.com/usdigitalresponse/univaf/issues/172
