#!/usr/bin/env bash
set -euo pipefail

if [ -z "${DB_NAME}" ]; then
  echo "Please set the DB_NAME environment variable."
  exit 1
fi

case "$ENV" in
  production) export CMD="" ;; # in prod, just run against the live db
     localdb) export CMD="" ;; # same for local, non-dockerized db
           *) export CMD="docker run -it --network host --rm -e PGPASSWORD=$DB_PASSWORD --volume $(pwd)/db:/db postgres" ;;
esac

export PGPASSWORD=$DB_PASSWORD

# drop the existing database
$CMD dropdb \
  --user=$DB_USERNAME \
  --host=$DB_HOST \
  $DB_NAME || true

# create the new database
$CMD createdb \
  --user=$DB_USERNAME \
  --host=$DB_HOST \
  $DB_NAME

# seed the database!
$CMD psql -d $DB_NAME -f ./db/schema.sql \
  --user=$DB_USERNAME \
  --host=$DB_HOST \

npm run db:seed
