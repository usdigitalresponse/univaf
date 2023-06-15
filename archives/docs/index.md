# UNIVAF Historical Data Archives

This site hosts historical data from UNIVAF, U.S. Digital Response’s COVID-19 Vaccine Appointment Finder API. The live API and documentation can be found at <https://getmyvax.org/>.

The historical data in this archive includes:

- A daily copy of each of the three main tables in the database (starting on June 3, 2021).
- A copy of every update to a location’s availability, grouped into one file for each day (starting on May 19, 2021).

Keep in mind that, since these are historical archives, the format of data has changed over time and data files from different dates may contain different fields. Historical service outages and incidents also impact the data on some days.

For an example of analyzing this data, see <https://github.com/usdigitalresponse/appointment-data-insights>.


## Loading Data Files

All files are stored as gzipped, [newline-delimited JSON (NDJSON)](http://ndjson.org/) files.


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
