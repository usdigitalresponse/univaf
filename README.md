# Appointment Availability MVP

## Goal

Get CVS to API running by Friday.

This project is broken up into two major chunks:

1. **`server`** is a small API server that wraps a Postgres DB. Various scrapers and API clients can `POST` appointment data to it, and end consumers can `GET` data from it.

2. **`loader`** is a set of scrapers and API clients than discover information about vaccine provider locations and appointment availability, then send it to the server. They can be run on a schedule, in a loop, or whatever works best. We hope to eventually add more here over time.


## Developing Locally

### Running Postgres

You will need to download the latest version of [Docker](https://www.docker.com/get-started) to run Postgres.

```bash
$ make docker     # makes the cross-OS compatible docker image
$ make compose    # runs the database as a background process on 5432
$ pgcli -p 5432 -h 127.0.0.1 postgres postgres   # connect locally and verify (optional)
$ postgres@127:postgres> \l                      # list the databases (optional)
+-----------+----------+------------+------------+------------+-----------------------+
| Name      | Owner    | Encoding   | Collate    | Ctype      | Access privileges     |
|-----------+----------+------------+------------+------------+-----------------------|
| postgres  | postgres | UTF8       | en_US.utf8 | en_US.utf8 | <null>                |
| template0 | postgres | UTF8       | en_US.utf8 | en_US.utf8 | =c/postgres           |
|           |          |            |            |            | postgres=CTc/postgres |
| template1 | postgres | UTF8       | en_US.utf8 | en_US.utf8 | =c/postgres           |
|           |          |            |            |            | postgres=CTc/postgres |
+-----------+----------+------------+------------+------------+-----------------------+
```

Next, seed the database

```bash
$ make seed
```

Finally run the server!

### Starting the API server

```bash
$ cd ./server/
$ npm run watch         # `watch` will auto-recompile typescript
$ npm run test          # `test` will run the various jest tests
$ open http://localhost:3000/providers
```

### Running the Loaders

To install, run `npm install` in the loader directory:

```bash
$ cd ./loader
$ npm install
```

Then load data from any supported sources by running `bin/appointment-availability-loader` with a list of the sources you want to load data from:

```bash
# Load data from NJVSS and the CVS API
$ bin/appointment-availability-loader njvss cvsApi
```

Use `--help` to see a list of sources and other options:

```bash
$ bin/appointment-availability-loader --help
appointment-availability-loader [sources..]

Load data about COVID-19 vaccine appointment availability from a
variety of different sources.

Supported sources: cvsApi, cvsScraper, njvss

Options:
  --version  Show version number                                       [boolean]
  --help     Show help                                                 [boolean]
  --send     Send availability info to the database at this URL         [string]
  --compact  Output JSON as a single line                              [boolean]
```


## Deploying to Production

TODO

## Design

### Database and schema

`/server/db`

-   design the database schema (prior art) Robert Brackett
-   generate the SQL to setup the db
-   Changelog? kinesis
-   running locally
-   running in AWS? Calvin French-Owen to confirm with channel

### Update API

`/server/api`

-   update { locationId, availability, timestamp, source, apiKey }
-   JSON, REST/HTTP, {Python/JS/TS}, Express/Sails/Hapi/Koa
-   running locally
-   running in AWS?

### Query API

-   MVP: create API read path
-   running in AWS
-   fronted by API gateway

### Scraper Infrastructure

-   today’s CVS scraper looks through a list of zip codes, and then returns n locations from the CVS backend, and then compare against ‘source of truth’ list of all locations.
    no matter what, we’ll need a list of all the locations
-   For chains: {chain}:{store-number}, for everywhere else create an arbitrary ID
-   Prior art: NJ, CovidWA, VaccineSpotter
-   scheduling: lambda per scraper, scheduled lambdas

### Misc decisions

-   provisioning toolkit: terraform
-   postgres, RDS
-   repo: github
