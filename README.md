[![Code of Conduct](https://img.shields.io/badge/%E2%9D%A4-code%20of%20conduct-blue.svg?style=flat)](https://github.com/usdigitalresponse/univaf/blob/main/CODE_OF_CONDUCT.md) [![CI Tests](https://github.com/usdigitalresponse/univaf/actions/workflows/ci.yml/badge.svg)](https://github.com/usdigitalresponse/univaf/actions/workflows/ci.yml)


# UNIVAF: Vaccine Appointment Availability API

UNIVAF is a system for gathering vaccination appointment availability information from providers across North America and making it available in a standard format via a free-to-use, open API. It supports both government- and community-run vaccine finders, such as [the State of New Jersey’s vaccine finder][nj-finder] and [Vaccinate the States][VtS]. You can access the live API and documentation at https://getmyvax.org/.

While currently focused on COVID-19 vaccinations, we hope the code and infrastructure here might be easily repurposed in the future for other kinds of everyday vaccinations (e.g. flu vaccines) or for future health emergencies.

**Table of Contents**

- [Project Structure](#project-structure)
- [Developing Locally](#developing-locally)
- [Deployment](#deployment)
- [Code of Conduct](#code-of-conduct)
- [Contributing](#contributing)
- [License & Copyright](#license--copyright)


## Project Structure

This project is broken up into three major components:

1. **`server`** is a small API server that wraps a Postgres database. Various scrapers and API clients can `POST` appointment data to it, and consumers can `GET` data from it. It’s currently accessible in production at https://getmyvax.org/.

2. **`loader`** is a set of scrapers and API clients that discover information about vaccine provider locations and appointment availability, then send it to the server. We currently run them on a schedule every few minutes (see [`terraform/loaders.tf`](./terraform/loaders.tf)), but they can also be run in a loop, as a server, or whatever works best.

3. **`ui`** is a demo frontend to display the data. It’s not especially fancy, and is meant more as a display of what can be done or a starter for states/community groups to build their own sites.

At the top level of this repo, you’ll also find some other useful directories:

- **`docs`** contains additional project documentation, infrastructure guidance, and incident reports.

- **`scripts`** contains scripts for managing releases, deployments, and other tasks.

- **`terraform`** contains Terraform configuration files used to deploy this project to AWS. We try to keep as much of our infrastructure configuration as possible stored here as code.


## Developing Locally

### Running Postgres

You will need to download the latest version of [Docker][docker] to run Postgres.

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
# Load data from NJVSS and the CVS SMART API
$ bin/univaf-loader njvss cvsSmart
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


## Deployment

Please see the [deployment section of the runbook](./docs/runbook#deployment).


## Code of Conduct

This repo falls under [U.S. Digital Response’s Code of Conduct](./CODE_OF_CONDUCT.md), and we will hold all participants in issues, pull requests, discussions, and other spaces related to this project to that Code of Conduct. Please see [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for the full code.


## Contributing

This project wouldn’t exist without the hard work of many people. Thanks to the following for all their contributions! Please see [`CONTRIBUTING.md`](./CONTRIBUTING.md) to find out how you can help.

<!--
Contributors are sorted alphabetically by last name. The contributions follow
All-Contributors categories and emoji. We add title attributes so people can
hover over the emoji and see what they represent.
The list is manually managed.
-->
<!-- ALL-CONTRIBUTORS-LIST:START -->
| Contributions | Name |
| ----: | :---- |
| [💻](# "Code") [🚇](# "Infrastructure") | [Jacob Aronoff](https://github.com/jaronoff97) |
| [💻](# "Code") [⚠️](# "Tests") [🚇](# "Infrastructure") [📖](# "Documentation") [💬](# "Answering Questions") [👀](# "Reviewer") | [Rob Brackett](https://github.com/Mr0grog) |
| [🤔](# "Ideas and Planning") [💻](# "Code") [⚠️](# "Tests") | [Dave Cole](https://github.com/dhcole) |
| [💻](# "Code") [⚠️](# "Tests") | [Nelson Elhage](https://github.com/nelhage) |
| [💼](# "Business") | Mike Flowers |
| [💻](# "Code") [⚠️](# "Tests") [🚇](# "Infrastructure") [📖](# "Documentation") | [Calvin French-Owen](https://github.com/calvinfo) |
| [🔬](# "Research") | [Tom MacWright](https://github.com/tmcw) |
| [💻](# "Code") | [Chantel Miller](https://github.com/channiemills) |
| [🤔](# "Ideas and Planning") | [Giuseppe Morgana](https://github.com/gamorgana) |
| [💻](# "Code") [⚠️](# "Tests") [🚇](# "Infrastructure") [📖](# "Documentation") [💬](# "Answering Questions") [👀](# "Reviewer") | [Aston Motes](https://github.com/astonm) |
| [📆](# "Project Management") | [Emilia Ndely](https://github.com/endely) |
| [💻](# "Code") [⚠️](# "Tests") | [Alan Ning](https://github.com/askldjd) |
| [🔬](# "Research") [💻](# "Code") | [Jan Overgoor](https://github.com/janovergoor) |
| [💻](# "Code") [⚠️](# "Tests") | [Christina Roberts](https://github.com/cmroberts) |
| [🔬](# "Research") [📓](# "User Testing") | [Mollie Ruskin](https://github.com/mollieru) |
| [💻](# "Code") | [Greg Sandstrom](https://github.com/gsandstrom) |
| [💻](# "Code") [⚠️](# "Tests") | [Stephan Schmidt](https://github.com/stephan-schmidt) |
| [💻](# "Code") [⚠️](# "Tests") | [Sam Szuflita](https://github.com/szunami) |
| [💻](# "Code") | [Jesse Vincent](https://github.com/obra) |
| [🤔](# "Ideas and Planning") [📆](# "Project Management") | Diana Wang |
<!-- ALL-CONTRIBUTORS-LIST:END -->

(For a [key to the contribution emoji][all-contributors-key] or more info on this format, check out [“All Contributors.”][all-contributors])


## License & Copyright

Copyright (C) 2021 U.S. Digital Response (USDR)

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this software except in compliance with the License. You may obtain a copy of the License at:

[`LICENSE`](./LICENSE) in this repository or http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.


[nj-finder]: https://covid19.nj.gov/finder
[VtS]: https://vaccinatethestates.com
[all-contributors]: https://allcontributors.org/
[all-contributors-key]: https://allcontributors.org/docs/en/emoji-key
[docker]: https://www.docker.com/get-started
