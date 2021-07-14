# Custom build of PostGIS 3 w/ Postgres 13

The Dockerfile and scripts in this directory are used to build a custom Docker image for PostGIS 3. Unfortunately, the official PostGIS images don't support ARM64 processors like Apple’s M1 (see this issue: https://github.com/postgis/docker-postgis/issues/216). The code here lets you build locally in order to create a compatible image.

**This Docker image is only meant to ease development; it is not for production use.**

You can also work around these issues by running PostGIS directly on your machine instead of via Docker. We recommend [Postgres.app](https://postgresapp.com/) on MacOS (it lets you manage multiple Postgres versions, more easily than with Homebrew) or via the system package manager on other systems.
