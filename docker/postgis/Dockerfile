# Custom build of PostGIS 3 w/ Postgres 13
#
# This exists because the official PostGIS images do not support ARM64
# architectures and therefore can't be used on processors like the Apple M1.
# See: https://github.com/postgis/docker-postgis/issues/216
# (We can remove this custom image once that issue is resolved.)
FROM postgres:13

LABEL maintainer="PostGIS Project - https://postgis.net"

ENV POSTGIS_MAJOR 3
ENV POSTGIS_RELEASE buster-pgdg

RUN apt-get update \
      && apt-cache showpkg postgresql-$PG_MAJOR-postgis-$POSTGIS_MAJOR \
      && apt-get install -y --no-install-recommends \
      postgresql-$PG_MAJOR-postgis-$POSTGIS_MAJOR/$POSTGIS_RELEASE \
      postgresql-$PG_MAJOR-postgis-$POSTGIS_MAJOR-scripts/$POSTGIS_RELEASE \
      && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /docker-entrypoint-initdb.d
COPY ./initdb-postgis.sh /docker-entrypoint-initdb.d/10_postgis.sh
COPY ./update-postgis.sh /usr/local/bin
