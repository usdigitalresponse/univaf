# PostgreSQL Management

- [Overview](#overview)
- [Backups](#backups)
- [Logging in with `psql`](#logging-in-with-psql)
- [Understanding Table Sizes](#understanding-table-sizes)
- [Repacking a Table](#repacking-a-table)


## Overview

The application is currently backed by a single PostgreSQL database server managed through AWS RDS. View the web console at: https://us-west-2.console.aws.amazon.com/rds/home?region=us-west-2

We have "performance insights" turned on, and you can navigate to it from the web console to see overall database load statistics and information about common or slow-performing queries.


## Backups

RDS is configured to save daily snapshots of the database, which you can browse at https://us-west-2.console.aws.amazon.com/rds/home?region=us-west-2#snapshots-list:tab=automated.


### Restoring From a Snapshot

When viewing the list of snapshots in the RDS web console, you can create a new database from one of the snapshots by selecting it and then choosing "restore snapshot" from the "actions" dropdown at the top of the list (or from the "actions" dropdown on the top-right of a snapshot's details page). You’ll then walk through the steps of setting a name, instance class, VPC, and other basic properties of the database. In most cases, you’ll want them to be the same as or similar to the database you are restoring a snapshot of, so use that database instance in the console as a reference.

*Note that you can’t restore directly to an existing database instance.* That means that, if you are switching to the backup data, you’ll need to create the new database from the snapshot, update and apply our Terraform configurations to point any relevant services to the new database, and then retire the old database (probably through Terraform again).


## Logging in with `psql`

For some maintenance and other tasks, you might need to log directly into the database and run commands with `psql`. Since the database is in a VPC without public access, you’ll need to log into the bastion server first, and run `psql` from there.

To log into the bastion server, see ["bastion server" in the runbook README][bastion-server].

Please take special care when logging directly into the production database; you’re working with live data!


## Understanding Table Sizes

RDS doesn’t provide great tools for taking a detailed look at the database, and if you are running low on disk space or need to understand what’s taking up resources, you may need to log in with `psql` and run some queries.

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


[issue-208]: https://github.com/usdigitalresponse/appointment-availability-infra/issues/208
[bastion-server]: ./README.md#bastion-server
