#!/usr/bin/env node
/**
 * XXX describe this script
 */

// TODO
// write a description of the script
// figure out s3 bucket creation
// figure out s3 configuration
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

const S3_BUCKET_NAME = "aston-usdr-test"; // XXX work on s3 configuration in general
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
      Bucket: S3_BUCKET_NAME,
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

  writeLog(`removing availability_log rows up to ${formatDate(runDate)}`);
  await deleteLoggedAvailabilityRows(runDate);
}

main()
  .then(() => writeLog("done"))
  .catch((error) => {
    console.error(error);
    Sentry.captureException(error);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
