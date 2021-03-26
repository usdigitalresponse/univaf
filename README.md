# Appointment Availability MVP

## Goal

Get CVS to API running by Friday.

## Developing Locally

### Running Postgres

You will need to download the latest version of [Docker](https://www.docker.com/get-started) to run Postgres.

```bash
$ docker-compose up -d    # runs the database as a background process on 5432
$ pgcli -p 5432 -h 127.0.0.1 postgres postgres   # connect locally and verify
$ postgres@127:postgres> \l                      # list the databases
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

TODO: add commands for setting the schema

### Starting the API server

```bash
$ cd ./server/api
$ npm install
$ npm run watch         # `watch` will auto-recompile typescript
$ npm run test          # `test` will run the various jest tests
```

## Deploying to Production

TODO

## Design

### Database and schema

`/server/db`

- design the database schema (prior art) Robert Brackett
- generate the SQL to setup the db
- Changelog? kinesis
- running locally
- running in AWS? Calvin French-Owen to confirm with channel

### Update API

`/server/api`

- update { locationId, availability, timestamp, source, apiKey }
- JSON, REST/HTTP, {Python/JS/TS}, Express/Sails/Hapi/Koa
- running locally
- running in AWS?

### Query API

- MVP: create API read path
- running in AWS
- fronted by API gateway

### Scraper Infrastructure

- today’s CVS scraper looks through a list of zip codes, and then returns n locations from the CVS backend, and then compare against ‘source of truth’ list of all locations.
  no matter what, we’ll need a list of all the locations
- For chains: {chain}:{store-number}, for everywhere else create an arbitrary ID
- Prior art: NJ, CovidWA, VaccineSpotter
- scheduling: lambda per scraper, scheduled lambdas

### Misc decisions

- provisioning toolkit: terraform
- postgres, RDS
- repo: github
