#!/usr/bin/env bash

if [ -z "${DB_NAME}" ]; then
  echo "Please set the DB_NAME environment variable."
  exit 1
fi

dropdb $DB_NAME || true
createdb $DB_NAME
psql -d $DB_NAME < db/schema.sql
npm run db:seed
