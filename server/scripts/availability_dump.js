#!/usr/bin/env node
/**
 * Script to run on a daily basis that writes out data from some db tables:
 * provider_locations, external_ids, availability, and availability_log.
 * The resulting ndjson files land in an S3 bucket specified by the
 * DATA_SNAPSHOT_S3_BUCKET environment variable.
 *
 * For the sake of keeping the table from exploding in size, it can clear old
 * rows out of availability_log. To enable the deletion, add the `--clear-log`
 * option when running the command.
 */

// TODO
// figure out how to schedule the task

const Sentry = require("@sentry/node");
const JSONStream = require("JSONStream");
const datefns = require("date-fns");

const aws = require("aws-sdk");
aws.config.update({ region: "us-west-2" });
const s3 = new aws.S3({ apiVersion: "2006-03-01" });

const knex = require("knex");
const knexConfig = require("../knexfile");
const db = knex(knexConfig.development);

const stream = require("stream");

const FIRST_RUN_DATE = datefns.parseISO("2021-05-14");

Sentry.init();

function writeLog(...args) {
  console.warn(...args);
}

function getTableStream(table) {
  return db(table).select("*").stream().pipe(JSONStream.stringify(false));
}

function getAvailabilityLogStream(date) {
  return db("availability_log")
    .select("*")
    .where("checked_at", ">", formatDate(date))
    .andWhere("checked_at", "<=", formatDate(datefns.add(date, { days: 1 })))
    .stream()
    .pipe(JSONStream.stringify(false));
}

async function getAvailabilityLogRunDates(upToDate) {
  const res = await s3
    .listObjects({
      Bucket: process.env.DATA_SNAPSHOT_S3_BUCKET,
      Prefix: "availability_log/",
    })
    .promise();
  const existingPaths = new Set(res.Contents.map((f) => f.Key));

  const dateRange = datefns.eachDayOfInterval({
    start: FIRST_RUN_DATE,
    end: upToDate,
  });

  const missing = [];
  for (const date of dateRange) {
    if (!existingPaths.has(pathFor("availability_log", date))) {
      missing.push(date);
    }
  }
  return missing;
}

async function deleteLoggedAvailabilityRows(upToDate) {
  await db("availability_log")
    .where("checked_at", "<=", formatDate(upToDate))
    .del();
}

async function uploadStream(s, path) {
  return s3
    .upload({
      Bucket: process.env.DATA_SNAPSHOT_S3_BUCKET,
      Key: path,
      Body: s.pipe(stream.PassThrough()), // PassThrough supports .read(), which aws-sdk.s3 needs
    })
    .promise();
}

function formatDate(date) {
  return date.toISOString().substr(0, 10);
}

function pathFor(type, date) {
  return `${type}/${type}-${formatDate(date)}.ndjson`;
}

async function main() {
  const clearLog = process.argv.includes("--clear-log");

  if (!process.env.DATA_SNAPSHOT_S3_BUCKET) {
    writeLog("DATA_SNAPSHOT_S3_BUCKET environment var required");
    return;
  }

  const now = new Date();
  const runDate = datefns.sub(now, { days: 1 }); // run for previous day

  for (const table of ["provider_locations", "external_ids", "availability"]) {
    writeLog(`writing ${pathFor(table, runDate)}`);
    await uploadStream(getTableStream(table), pathFor(table, runDate));
  }

  const logRunDates = await getAvailabilityLogRunDates(runDate);
  for (const logRunDate of logRunDates) {
    writeLog(`writing ${pathFor("availability_log", logRunDate)}`);
    await uploadStream(
      getAvailabilityLogStream(logRunDate),
      pathFor("availability_log", logRunDate)
    );
  }

  if (clearLog) {
    writeLog(`clearing availability_log rows up to ${formatDate(runDate)}`);
    await deleteLoggedAvailabilityRows(runDate);
  }
}

main()
  .then(() => writeLog("done"))
  .catch((error) => {
    console.error(error);
    Sentry.captureException(error);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
