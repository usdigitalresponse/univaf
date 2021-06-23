# 2021-06-11: Database Storage Low

## Summary

While we [resolved the emergencies on 6/3](./2021-06-03--database-full.md), we never enabled auto-deletion of old logs, and eventually ran low on database disk space again. Luckily, the alerms we put in place after the previous incident alerted us to the issue before it took the API service down, so we never encountered an actual *outage* as part of this incident and had ample time to resolve the issue.

## Timeline

*(All times US/Pacific, 24-hour clock.)*

### 2021-06-11 21:01

CloudWatch alarm posts to Slack about low disk space for the database. The cause was initially unclear because the database’s free space dropped significantly rather than following the same pace it had been, but the most likely and obvious cause is the same as the last incident: the `availability_logs` table is too big.

### 2021-06-11 21:40

More digging makes it clear the big drop in space is a *daily* pattern caused by transaction logs for the S3 dump. Some of this space will automatically be recovered as those logs are deleted, but we are still in a low-space state that needs fixing.

### 2021-06-11 21:54

We decide to delete several days of early `availability_logs` data in the morning, since it should already be safely stored in S3. We have a few days before we run out of disk space at the current pace, so better to work on this after getting some sleep.

### 2021-06-12 9:51

@Mr0grog deletes several days of the earliest data in `availability_logs`, but doing so does not immediately free up disk space. We decide to wait and see if Postgres will eventually release that space.

### 2021-06-12 12:53

@Mr0grog gets anxious and deletes more old data from `availability_logs`.

### 2021-06-12 12:59

Deploy changes to automatically start deleting old logs from the database ([#184][issue-184]). This will run for the first time late tonight.

### 2021-06-12 17:56

None of the used disk space has been reclaimed, but no new disk space on the database server has been used either. After more digging, we discover that Postgres will actually *never* give up disk space once it’s been allocated to a table except when dropping the table, truncating the table, re-clustering the table, or doing a *full* vacuum of the table. The first two are operations we don’t want to do, and the latter two require free disk space equivalent to the size of the table, which we do not have.

The upside is that we have more time to figure out how to resolve this, because Postgres is re-using the many gigabytes of dead space we created by deleted old rows instead of allocating new disk space to the table.

### 2021-06-12 20:22

@astonm discovers `pg_repack` as a possible low-downtime solution: https://medium.com/dunzo/reclaiming-storage-space-in-postgres-d32fa4168e67 (re-clustering and full-vacuuming each lock the table for the full time of the operation).

### 2021-06-12 20:44

Since all options (including `pg_repack`) require essentially double the current disk space, we decide to schedule time at night after the daily S3 dump later in the week to:

1. Snapshot the database.
2. Bump up the disk size via Terraform.
3. Take a remediation step manually. Will decide tomorrow whether this means `pg_repack`, `CLUSTER`, or `VACUUM FULL`.

Night-time is less critical for us since all our data and usage is in the United States.

### 2021-06-14 9:20

@Mr0grog experiments with different remediation approaches on a copy of the database. `CLUSTER` and `VACUUM FULL` both take roughly 40 minutes on the table at its current size. `pg_repack` requires a primary key column, which this table does not have. Adding once locks the table for 40 minutes, so `pg_repack` ultimately takes the DB offline for *longer* than other approaches in this particular case (for any other table, it would be great).

### 2021-06-14 12:32

Create final plan for fixing the database during the weekly meeting. Plan: [#208][issue-208]. @Mr0grog will execute it Tuesday night (2021-06-15).

### 2021-06-16 0:50

Database resized, table repacked, all good!


## Lessons

### What Went Well

- New alerting made issues visible to more project members.
- New alerting notified us before the problem became a failure, and we were never in a rush.
- We learned *a ton* about how Postgres manages disk space! ;)


### What Went Wrong

- This incident was caused by our failure to finish all the followup work from the previous incident.
- We did not understand Postgres’s disk usage patterns well enough beforehand, and made plans around resource needs that were far too low.


## Action Items

N/A


## Responders

- @astonm
- @Mr0grog


[issue-184]: https://github.com/usdigitalresponse/appointment-availability-infra/issues/184
[issue-208]: https://github.com/usdigitalresponse/appointment-availability-infra/issues/208
