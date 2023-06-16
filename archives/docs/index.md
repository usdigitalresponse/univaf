# UNIVAF Historical Data Archives

This site hosts historical data from UNIVAF, U.S. Digital Response’s COVID-19 Vaccine Appointment Finder API, <https://getmyvax.org/>. **The API is no longer live and was shut down on June 15, 2023.**

The historical data in this archive includes:

- A daily copy of each of the three main tables in the database (starting on June 3, 2021 and ending on June 15, 2023).
- A copy of every update to a location’s availability, grouped into one file for each day (starting on May 19, 2021 and ending on June 15, 2023).
- A final backup of the database in Postgres SQL format (June 16, 2023).
- A final backup of the database in SQLite format (June 16, 2023).

Keep in mind that, since these are historical archives, the format of data has changed over time and data files from different dates may contain different fields. Historical service outages and incidents also impact the data on some days.

Also note that UNIVAF began operation in March 2023, but did not start archiving historical data until May.

For an example of analyzing this data, see <https://github.com/usdigitalresponse/appointment-data-insights>.


## Loading Data Files

Except for the final backups, all files are stored as gzipped, [newline-delimited JSON (NDJSON)](http://ndjson.org/) files.


### Database Copies

Daily copies of the `provider_locations`, `external_ids`, and `availability` tables are stored in a separate directory for each table, and a separate file for each day. Files are named like:

```
https://archives.getmyvax.org/<table>/<table>-<date>.ndjson.gz
```

For example, for the contents of the `provider_locations` table on October 1, 2021, download:

```
https://archives.getmyvax.org/provider_locations/provider_locations-2021-11-01.ndjson.gz
```

Each record in the table is a separate JSON line in the file.


### Availability Update Logs

In addition to daily copies of the database, you can access lists of every single update to a location’s availability in the `/availability_log` directory. Updates are grouped by day, and files are named like:

```
https://archives.getmyvax.org/availability_log/availability_log-<date>.ndjson.gz
```

For example, to get every update on October 1, 2021, download:

```
https://archives.getmyvax.org/availability_log/availability_log-2021-11-01.ndjson.gz
```

Each update is a separate line in the file. The schema of each record is the same as the `availability` table, but in most cases, _only the fields that changed in that update are filled in_. To get a complete picture of the availability of a location at a given time, you will need to scan backwards in time through the availability logs to find the last complete record for the given source and location ID.


### Final Database Backups

A final copy of the database after the service stopped updating is available in Postgres-compatible SQL format and as a SQLite 3 file. Both are gzipped:

- Postgres: `https://archives.getmyvax.org/sql/univaf_postgres_dump-2023-06-16.sql.gz`
- SQLite: `https://archives.getmyvax.org/sql/univaf_sqlite-2023-06-16.sqlite3.gz`
