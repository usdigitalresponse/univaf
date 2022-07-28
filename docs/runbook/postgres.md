# PostgreSQL Management

- [Overview](#overview)
- [Backups](#backups)
- [Logging in with `psql`](#logging-in-with-psql)
- [Understanding Table Sizes](#understanding-table-sizes)
- [Repacking a Table](#repacking-a-table)


## Overview

The application is currently backed by a single PostgreSQL database server managed through Render. You can view metrics or logs and get a login URL for `psql` in Render’s web dashboard (https://dashboard.render.com/).


## Backups

Render is configured to save daily snapshots of the database, which you can browse in the web dashboard. For details on backups and restoring, see the Render docs: https://render.com/docs/databases#backups.


## Logging in with `psql`

For some maintenance and other tasks, you might need to log directly into the database and run commands with `psql`. At the moment, you can do this from your own local machine, but we may disable that, and should probably log in from within Render’s data center instead. There are a couple ways to do this:

1. You can start a shell session in your browser by opening Render’s web dashboard, clicking on a service or cron job, and clicking on “shell” in the sidebar.

    ![Render Web Shell](../_assets/render-web-shell.png)

2. Alternatively, you can SSH into a Render service by following the directions at https://render.com/docs/ssh.

Please take special care when logging directly into the production database; you’re working with live data!


## Understanding Table Sizes

Render doesn’t provide great tools for taking a detailed look at the database, and if you are running low on disk space or need to understand what’s taking up resources, you may need to log in with `psql` and run some queries.

The following query can be pretty helpful in understanding basic size information about tables:

```sql
SELECT
  relname as table_name,
  pg_size_pretty(pg_total_relation_size(relid)) As "Total Size",
  pg_size_pretty(pg_relation_size(relid)) as "Content Size",
  pg_size_pretty(pg_indexes_size(relid)) as "Index Size",
  pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) as "Non-Content Size",
  pg_stat_get_live_tuples(relid) AS "Live Tuples",
  pg_stat_get_dead_tuples(relid) AS "Dead Tuples"
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

Postgres has a *huge* amount of tooling for reporting on a database. Digging into the docs, Stack Overflow, or googling will turn up a lot of other functions or queries that go way beyond the above.


## Repacking a Table

If a table gets too big and you need to save disk space on the database server, you may need to repack the table after deleting some rows (See [#208][issue-208] for an incident where we needed to do this). When rows are deleted in Postgres, the database does not release the corresponding disk space. Instead, it reserves it for later re-use when it needs to write new rows. If you need to reclaim disk space, you’ll need to perform one of the following operations:

- `TRUNCATE <table>` or `DROP TABLE <table>`. Usually either one of these is not what you want, since they involve deleting all data in the table.

- `VACUUM FULL <table>` removes all dead rows and extra space from the table. It requires as much free disk space as the existing data takes up. **It locks the table for as long as the operation takes,** so make sure a maintenance window of some sort is planned before running this.

- `CLUSTER <table>` re-orders the existing rows on disk so that they match the order of a given index. As a consequence, it removes all dead rows and extra space from the table. It requires as much free disk space as the existing data takes up. **It locks the table for as long as the operation takes,** so make sure a maintenance window of some sort is planned before running this.

- `pg_repack` is an extension that can remove dead rows and extra space while the table is live and available for writes, but it requires the table to have some column that can serve as a unique key (i.e. something that is effectively a primary key, although it does not have to be set as an actual primary key in the table definition). It requires the same extra space that `CLUSTER` and `VACUUM FULL` do, and runs a little bit slower. This article offers a good overview of how to get started with `pg_repack`: https://medium.com/dunzo/reclaiming-storage-space-in-postgres-d32fa4168e67


[issue-208]: https://github.com/usdigitalresponse/univaf/issues/208
