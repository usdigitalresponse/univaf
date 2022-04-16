# 2022-04-15: Availability Updates Broken Because External IDs are Out of IDs

## Summary

Data updates from the loaders (i.e. posts to `/api/edge/update`) were broken, preventing new data from being saved. Reads from the API were not affected, so users could still get data without any problems (although appointment availability counts and slots would be old).

The underlying issue turned out to be that we had an auto-incrementing integer for the `id` column on the `external_ids` table and had used every possible integer. Due to the way we keep that table up-to-date, we use one value from the sequence of possible IDs every time we check whether a `(location, system, value)` combination is listed in the table, even if we don’t write a new row that actually needs that value. We do this on most updates, so we actually move through possible IDs pretty quickly (roughly 450,000/hour). (This is all because of a nice Postgres feature called `INSERT .. ON CONFLICT DO ...` that lets you do batched, atomic, idempotent upserts. It’s pretty neat, but we had not considered this problem with sequences.)

For now, we solved the issue by switching from `integer` to `bigint` for the `id` column in the `external_ids` table. At the current usage rate, we’ll run out again in about 4.3 billion years, which is probably not worth worrying about. That said, we might want to make the system behave better and not use up 450,000 sequence values every hour to begin with. (See [action items](#action-items) at the end of this report.)


## Timeline

*(All times US/Pacific, 24-hour clock.)*

### 2022-04-15 4:35

Updates start failing. Sentry tracks this in issues [3195943236][sentry-3195943236] and [3155794613][sentry-3155794613] and posts an alert to Slack.


### 2022-04-15 6:50

@Mr0grog checks his e-mail and starts investigating the issue.


### 2022-04-15 7:44

@Mr0grog gets a handle on the immediate cause (exhausting all possible `id` values in the `external_ids` table) and posts a summary in Slack along with a possible solution. Because reads are unaffected and having up-to-the-minute availability is less critical now, he decides to take a break to address some personal matters.


### 2022-04-15 9:20

@astonm suggests using `bigint` on Slack, which is a nice quick fix and much lower-effort. He does not have time to work on implementation.


### 2022-04-15 11:45

@Mr0grog returns to working on this, and starts trying to understand why we’ve run out of IDs before choosing a solution.


### 2022-04-15 12:28

It turns out the underlying problem is that `INSERT ... ON CONFLICT DO ...`, which we call on every update that has *potential* new external IDs (see [`addExternalIds()` in `server/src/db.ts`][addExternalIds]) uses up a value from the sequence that supports the `id` column even if it does not wind up inserting a new row. This is a fundamental issue that can’t be fixed (except in the Postgres project itself). However, this also means there’s nothing that’s spiked or gone out of control to use up so many IDs, and that our usage is predictable, so there’s no reason not to start with @astonm’s simple solution of using `bigint`.


### 2022-04-15 13:19

@Mr0grog posts [a hotfix PR (#630)][issue-630] that changes the type for `external_ids.id` to `bigint`.


### 2022-04-15 13:31

@Mr0grog deploys the hotfix to AWS. Issue is resolved.


## Lessons

### What Went Well

- Sentry alerts gave us a clear heads-up about the issue.
- The read and write APIs are sufficiently separated that these failures didn’t disrupt external usage, and only meant government partners would receive data that was a few hours old instead of having the whole system go down.
- @astonm’s continued participation as a thinking collaborator helped surface a simpler and quicker solution to the problem.


### What Went Wrong

- With a skeleton crew and nobody able to dedicate “on-call” time, it took us 9 hours to resolve a problem that could have been solved in 4.5 hours (even including a few hours for it to simmer in the wee hours when nobody was awake).

- We should have used `bigint` for the `id` column in the first place, which is a best practice and would have avoided the issue entirely.


## Action Items

This issue is pretty well solved for the forseeable future (we won’t run out of `bigint` values for 4.3 billion years), but it might be good to do some cleanup (detailed in [#631][issue-631]). The main thing is to not waste so many potential `id` values by doing one of:

- Drop the `id` column and use `(provider_location_id, system, value)` as a compound primary key.

- Use a more complex, non-atomic `INSERT ... SELECT ... WHERE NOT EXISTS (...)` pattern instead of an `INSERT ... ON CONFLICT ...` statement.

- Get all the current external IDs for a location, compare them in JS, and only attempt to insert the ones that are actually new (this is basically the same as the above, but implemented in JS instead of in SQL).

[#631][issue-631] provides more depth on the above options. It also details some other cleanup we might do on the `external_ids` table that this incident highlighted, but which is not actually pertinent to the underlying cause of the incident.


## Responders

- @Mr0grog


[sentry-3195943236]: https://sentry.io/organizations/usdr/issues/3195943236
[sentry-3155794613]: https://sentry.io/organizations/usdr/issues/3155794613
[issue-630]: https://github.com/usdigitalresponse/univaf/pull/630
[issue-631]: https://github.com/usdigitalresponse/univaf/issues/631
[addExternalIds]: https://github.com/usdigitalresponse/univaf/blob/173fc2634c5b12e97cb67b08dbc871a2b4e370ce/server/src/db.ts#L120-L150
