#!/usr/bin/env bash

if [ -z "${DB_NAME}" ]; then
  echo "Please set the DB_NAME environment variable."
  exit 1
fi

# drop the existing database
docker run -it --network host --rm -e PGPASSWORD=$DB_PASSWORD  \
  postgres dropdb \
  --user=$DB_USERNAME \
  --host=$DB_HOST \
  $DB_NAME || true

# create the new database
docker run -it --network host --rm -e PGPASSWORD=$DB_PASSWORD \
  postgres createdb \
  --user=$DB_USERNAME \
  --host=$DB_HOST \
  $DB_NAME

# seed the database!
docker run -it --network host --rm -e PGPASSWORD=$DB_PASSWORD --volume "$(pwd)"/db:/db \
  postgres psql -d $DB_NAME -f /db/schema.sql \
  --user=$DB_USERNAME \
  --host=$DB_HOST \

npm run db:seed
