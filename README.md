# UNIVAF: Vaccine Appointment Availability API

## Goal

Get CVS to API running by Friday.

This project is broken up into three major chunks:

1. **`server`** is a small API server that wraps a Postgres DB. Various scrapers and API clients can `POST` appointment data to it, and end consumers can `GET` data from it.

2. **`loader`** is a set of scrapers and API clients than discover information about vaccine provider locations and appointment availability, then send it to the server. They can be run on a schedule, in a loop, or whatever works best. We hope to eventually add more here over time.

3. **`ui`** is a demo frontend to display the data. It’s not especially fancy, and is meant more as a display of what can be done or a starter for states/community groups to build their own site.


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
$ source ./server/.env # if you haven't already, source the env vars (you may need to modify these!)
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

Then load data from any supported sources by running `bin/univaf-loader` with a list of the sources you want to load data from:

```bash
# Load data from NJVSS and the CVS API
$ bin/univaf-loader njvss cvsApi
```

Use `--help` to see a list of sources and other options:

```bash
$ bin/univaf-loader --help
univaf-loader [sources..]

Load data about COVID-19 vaccine appointment availability from a
variety of different sources.

Supported sources: cvsApi, cvsScraper, cvsSmart, njvss, riteAidApi,
vaccinespotter, waDoh

Commands:
  univaf-loader [sources..]     Load data about COVID-19 vaccine appointment
                                availability from a
                                variety of different sources.

                                Supported sources: cvsApi, cvsScraper, cvsSmart,
                                njvss, riteAidApi, vaccinespotter, waDoh
                                                                       [default]
  univaf-loader server          Start a web server that loads vaccine
                                appointment availability when an
                                HTTP POST request is made to "/".

                                Use the "PORT" environment variable to specify
                                what port to listen on.

Options:
  --version                Show version number                         [boolean]
  --help                   Show help                                   [boolean]
  --send                   Send availability info to the API specified by the
                           environment variable API_URL                [boolean]
  --compact                Output JSON as a single line                [boolean]
  --states                 Comma-separated list of states to query for
                           multi-state sources (e.g. vaccinespotter)    [string]
  --vaccinespotter-states  Overrides the `--states` option for vaccinespotter
                                                                        [string]
  --rite-aid-states        Overrides the `--states` option for riteAidApi
                                                                        [string]
```


### Building and Viewing the UI

To install, run `npm install` in the ui directory:

```bash
$ cd ./ui
$ npm install
```

The UI needs an API server to load data from. By default, it will use `http://localhost:3000`, but if you want to use a different server, set the `DATA_URL` environment variable.

Then you can start the development server with `npm start`:

```bash
$ export DATA_URL='http://api.server.com'
$ npm start
```

And open your browser to `http://localhost:8080` to see it in action.

You can also build a production copy of the UI with `npm run build`:

```bash
$ NODE_ENV=production npm run build
```

That will create a JS file and an HTML file in the `ui/dist/` directory. The HTML file is an example, while the JS file is a standalone UI. (The idea here is to keep it portable; a site could embed the UI by simple adding a `<script>` tag to a page.)




## Deploying to Production

### Deploying the Server & Loaders

Our infrastructure deploys are managed via Terraform Cloud, and new Terraform plans are triggered by changing the configured API version.
By convention, the API version is the git hash of the commit you want to deploy, and we have a simple deployment script `scripts/deploy_infra.sh`
that manages everything for you. The workflow is as follows:

1. Merge your latest pull request.
2. On the `main` branch, run `scripts/deploy_infra.sh`, which will create a new commit.
3. Push the commit it makes to `origin`.
4. Locate the related Run on Terraform.io and Confirm it to initiate the deploy.

### Deploying the UI

The UI is currently deployed directly to GitHub Pages with an actions workflow, so you can view the demo at https://usdigitalresponse.github.io/appointment-availability-infra/.

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
