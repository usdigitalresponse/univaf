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

const Sentry = require("@sentry/node");
const aws = require("aws-sdk");
const fs = require("fs");
const knex = require("knex");
const knexConfig = require("../knexfile");
const luxon = require("luxon");
const JSONStream = require("JSONStream");
const stream = require("stream");

Sentry.init();

const db = knex(knexConfig.development);
const s3 = new aws.S3();

const FIRST_RUN_DATE = luxon.DateTime.fromISO("2021-05-19", { zone: "utc" });

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
    .andWhere("checked_at", "<=", formatDate(date.plus({ days: 1 })))
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

  const dateRange = eachDayOfInterval({
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

async function writeStreamToLocal(s, path) {
  const writeStream = fs.createWriteStream(`output/${path}`);
  s.pipe(writeStream);
  return new Promise((resolve, reject) => {
    s.on("close", resolve);
    s.on("error", reject);
  });
}

async function ensureLocalOutputDirs() {
  const dirs = [
    "provider_locations",
    "external_ids",
    "availability",
    "availability_log",
  ];
  for (const dir of dirs) {
    try {
      fs.mkdirSync(`output/${dir}`, { recursive: true });
    } catch (err) {
      if (err.code !== "EEXIST") {
        throw err;
      }
    }
  }
}

function formatDate(date) {
  return date.toFormat("yyyy-MM-dd");
}

function pathFor(type, date) {
  return `${type}/${type}-${formatDate(date)}.ndjson`;
}

function eachDayOfInterval({ start, end }) {
  const interval = start.startOf("day").until(end.endOf("day"));
  return interval.splitBy({ days: 1 }).map((d) => d.start);
}

async function main() {
  const clearLog = process.argv.includes("--clear-log");
  let writeStream = uploadStream;

  if (!process.argv.includes("--write-to-s3")) {
    writeStream = writeStreamToLocal;
    await ensureLocalOutputDirs();
  }

  if (!process.env.DATA_SNAPSHOT_S3_BUCKET) {
    writeLog("DATA_SNAPSHOT_S3_BUCKET environment var required");
    return;
  }

  const now = luxon.DateTime.utc();
  const runDate = now.minus({ days: 1 }); // run for previous day

  for (const table of ["provider_locations", "external_ids", "availability"]) {
    writeLog(`writing ${pathFor(table, runDate)}`);
    await writeStream(getTableStream(table), pathFor(table, runDate));
  }

  const logRunDates = await getAvailabilityLogRunDates(runDate);
  for (const logRunDate of logRunDates) {
    writeLog(`writing ${pathFor("availability_log", logRunDate)}`);
    await writeStream(
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
