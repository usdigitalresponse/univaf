#!/usr/bin/env node
/**
 * XXX describe this script
 */

// TODO
// write a description of the script
// figure out s3 bucket creation
// figure out s3 configuration
// what's the plan with external ids?
// figure out how to schedule the task
// deal with the HUGE table

const _ = require("lodash");
const Sentry = require("@sentry/node");
const JSONStream = require("JSONStream");
const datefns = require("date-fns");

var aws = require("aws-sdk");
aws.config.update({ region: "us-west-2" });
s3 = new aws.S3({ apiVersion: "2006-03-01" });

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

function getProviderLocationsStream(path) {
  // xxx what to do about external_ids?
  return db("provider_locations")
    .select("*")
    .stream()
    .pipe(JSONStream.stringify(false));
}

function getAvailabilityLogStream(date) {
  return db("availability_log")
    .select("*")
    .where("checked_at", ">", formatDate(date))
    .andWhere("checked_at", "<=", formatDate(datefns.add(date, { days: 1 })))
    .stream()
    .pipe(JSONStream.stringify(false))
}

async function getAvailabilityLogRunDates(upToDate) {
  const res = await s3
    .listObjects({ Bucket: S3_BUCKET_NAME, Prefix: "availability/" })
    .promise();
  const existingPaths = new Set(res.Contents.map((f) => f.Key));

  const dateRange = datefns.eachDayOfInterval({
    start: FIRST_RUN_DATE,
    end: upToDate,
  });

  const missing = [];
  for (date of dateRange) {
    if (!existingPaths.has(pathFor("availability", date))) {
      missing.push(date);
    }
  }
  return missing;
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
  return `${type}/${formatDate(date)}.ndjson`;
}

async function main() {
  const runDate = datefns.sub(new Date(), { days: 1 }); // run for previous day

  writeLog(`writing ${pathFor("provider_locations", runDate)}`);
  await uploadStream(
    getProviderLocationsStream(),
    pathFor("provider_locations", runDate)
  );

  const logRunDates = await getAvailabilityLogRunDates(runDate);
  for (const logRunDate of logRunDates) {
    writeLog(`writing ${pathFor("availability", logRunDate)}`);
    await uploadStream(
      getAvailabilityLogStream(logRunDate),
      pathFor("availability", logRunDate)
    );
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
