#!/usr/bin/env node
/**
 * Script to run on a daily basis that writes out data from some db tables:
 * provider_locations, external_ids, availability, and availability_log. It
 * decides which days of the availability_log to export by checking for
 * missing output files in the S3 bucket specified by the environment var
 * DATA_SNAPSHOT_S3_BUCKET.
 *
 * By default the script writes to local disk (in a directory named output/).
 * Add the `--write-to-s3` flag to upload the resulting ndjson files into
 * the DATA_SNAPSHOT_S3_BUCKET.
 *
 * For the sake of keeping the availability_log table from exploding in size,
 * the script can clear old rows out. To enable this deletion, add the flag
 * `--clear-log` when running the command.
 */

import { Upload } from "@aws-sdk/lib-storage";
import { S3, ListObjectsV2CommandInput } from "@aws-sdk/client-s3";
import * as Sentry from "@sentry/node";
import fs from "node:fs";
import knex, { type Knex } from "knex";
import knexConfig from "../knexfile";
import { DateTime } from "luxon";
import JSONStream from "JSONStream";
import stream from "node:stream";
import { pipeline } from "node:stream/promises";
import { Buffer } from "node:buffer";
import zlib from "node:zlib";

Sentry.init();

const db = knex(knexConfig.development);
// TODO: remove support for AWS_DEFAULT_REGION. We currently use it, and it was
// automatically picked up in v2 of the SDK. That no longer seems to be the
// case. (AWS_REGION works, though.)
const s3 = new S3({
  region:
    process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1",
});

const FIRST_RUN_DATE = DateTime.fromISO("2021-05-19", { zone: "utc" });

function writeLog(...args: any[]) {
  console.warn(...args);
}

function selectSqlPoint(column: string) {
  return `
  CASE WHEN ${column} is null THEN null
  ELSE
    json_build_object(
      'longitude', st_x(${column}::geometry),
      'latitude', st_y(${column}::geometry)
    )
  END as ${column}
  `.trim();
}

function removeNullPropertiesStream() {
  return new stream.Transform({
    objectMode: true,
    transform(record, _encoding, callback) {
      for (const key of Object.keys(record)) {
        if (record[key] === null) delete record[key];
      }
      callback(null, record);
    },
  });
}

/**
 * Get a set with the names of all the objects in an S3 bucket. This paginates
 * through all results from the S3 API and may make many requests.
 */
async function getAllBucketObjects(
  options: ListObjectsV2CommandInput
): Promise<Set<string>> {
  const objects: Set<string> = new Set();

  let requestOptions = options;
  while (requestOptions) {
    const res = await s3.listObjectsV2(requestOptions);
    for (const object of res.Contents) {
      objects.add(object.Key);
    }

    if (res.NextContinuationToken) {
      requestOptions = {
        ...requestOptions,
        ContinuationToken: res.NextContinuationToken,
      };
    } else {
      requestOptions = null;
    }
  }

  return objects;
}

/**
 * A stream that emits buffers of a given size (in bytes). Useful when an input
 * stream might emit data in small chunks, while the next stream in a pipeline
 * works more efficiently with larger chunks, or chunks of a given size.
 *
 * In practice, we use this for gzipping, since gzip streams work most
 * efficiently if data comes in chunks of at least 32 kB (this actually makes
 * a pretty big difference).
 *
 * We couldn't find a good version of this on NPM (which seems surprising,
 * we're probably missing it). The `stream-chunker` package, which is popular,
 * performs *terribly* and is often worse than no chunking at all.
 */
class BufferedStream extends stream.Transform {
  #buffer: Buffer = null;
  #size = 0;
  #offset = 0;

  constructor({ size = 256 * 1024, ...options } = {}) {
    super(options);
    this.#size = size;
    this.resetBuffer();
  }

  resetBuffer() {
    // Allocate a *new* buffer because we emit the previous buffer to the
    // stream's consumer (in `_transform`) and can no longer safely write to it.
    this.#buffer = Buffer.allocUnsafe(this.#size);
    this.#offset = 0;
  }

  _transform(input: any, encoding: BufferEncoding, callback: CallableFunction) {
    if (typeof input === "string") {
      input = Buffer.from(input, encoding);
    } else if (!(input instanceof Buffer)) {
      callback(
        new TypeError(
          `BufferedStream input must be strings or buffers, not ${input.constructor.name}`
        )
      );
      return;
    }

    let inputPosition = 0;
    while (inputPosition < input.length) {
      const written = input.copy(this.#buffer, this.#offset, inputPosition);
      inputPosition += written;
      this.#offset += written;

      if (this.#offset === this.#size) {
        // Emit the filled buffer rather than a copy. `resetBuffer` allocates a
        // new buffer more efficiently than making a copy.
        this.push(this.#buffer);
        this.resetBuffer();
      }
    }
    callback();
  }

  _flush(callback: CallableFunction) {
    if (this.#offset > 0) {
      this.push(this.#buffer.subarray(0, this.#offset));
    }
    callback();
  }

  _destroy(error: Error, callback: CallableFunction) {
    this.#buffer = null;
    callback(error);
  }
}

function bufferedGzipStream(size = 64 * 1024) {
  return stream.compose(
    new BufferedStream({ size }),
    zlib.createGzip({
      level: zlib.constants.Z_BEST_COMPRESSION,
      chunkSize: size,
    })
  );
}

function getQueryStream(queryBuilder: Knex.QueryBuilder) {
  return queryBuilder.stream().pipe(JSONStream.stringify(false));
}

function getTableStream(table: string) {
  return getQueryStream(db(table).select("*"));
}

function getProviderLocationsStream() {
  return getQueryStream(
    db("provider_locations")
      .select("*")
      .select(db.raw(selectSqlPoint("position"))) // override binary-encoded column with json version
  );
}

/**
 * Create a Knex query for availability logs on a given date.
 */
function availabilityLogQueryForDate(date: DateTime) {
  return db("availability_log")
    .select("*")
    .where("checked_at", ">", formatDate(date))
    .andWhere("checked_at", "<=", formatDate(date.plus({ days: 1 })))
    .orderBy("checked_at", "asc");
}

function getAvailabilityLogStream(date: DateTime) {
  return availabilityLogQueryForDate(date)
    .stream()
    .pipe(removeNullPropertiesStream())
    .pipe(JSONStream.stringify(false));
}

/**
 * Determine whether there are availability logs in the DB for a given date.
 */
async function availabilityLogsExist(date: DateTime) {
  // A limit(1) query is much lighter on the DB that count(*), which *always*
  // performs a table scan, even if there is a relevant index.
  const results = await availabilityLogQueryForDate(date).limit(1);
  return results.length > 0;
}

async function getAvailabilityLogRunDates(upToDate: DateTime) {
  const existingPaths = await getAllBucketObjects({
    Bucket: process.env.DATA_SNAPSHOT_S3_BUCKET,
    Prefix: "availability_log/",
  });

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

async function deleteLoggedAvailabilityRows(upToDate: DateTime) {
  await db("availability_log")
    .where("checked_at", "<=", formatDate(upToDate))
    .del();
}

type StreamToPathFunction = (s: stream.Readable, path: string) => Promise<any>;

async function uploadStream(s: stream.Readable, path: string) {
  const s3Upload = new Upload({
    client: s3,
    params: {
      Bucket: process.env.DATA_SNAPSHOT_S3_BUCKET,
      Key: path,
      Body: s.pipe(new stream.PassThrough()), // PassThrough supports .read(), which aws-sdk.s3 needs
    },
    queueSize: 10,
    partSize: 1024 * 1024 * 10,
  });

  return await s3Upload.done();
}
uploadStream satisfies StreamToPathFunction;

async function writeStreamToLocal(s: stream.Readable, path: string) {
  return await pipeline(s, fs.createWriteStream(`output/${path}`));
}
writeStreamToLocal satisfies StreamToPathFunction;

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

function formatDate(date: DateTime) {
  return date.toFormat("yyyy-MM-dd");
}

function pathFor(type: string, date: DateTime) {
  return `${type}/${type}-${formatDate(date)}.ndjson.gz`;
}

function eachDayOfInterval({ start, end }: { start: DateTime; end: DateTime }) {
  const interval = start.startOf("day").until(end.endOf("day"));
  return interval.splitBy({ days: 1 }).map((d) => d.start);
}

async function main() {
  const clearLog = process.argv.includes("--clear-log");
  let writeStream: StreamToPathFunction = uploadStream;

  if (!process.argv.includes("--write-to-s3")) {
    writeStream = writeStreamToLocal;
    await ensureLocalOutputDirs();
  }

  if (!process.env.DATA_SNAPSHOT_S3_BUCKET) {
    writeLog("DATA_SNAPSHOT_S3_BUCKET environment var required");
    process.exitCode = 1;
    return;
  }

  const now = DateTime.utc();
  const runDate = now.minus({ days: 1 }); // run for previous day

  for (const table of ["external_ids", "availability"]) {
    writeLog(`writing ${pathFor(table, runDate)}`);
    await writeStream(
      stream.compose(getTableStream(table), bufferedGzipStream()),
      pathFor(table, runDate)
    );
  }

  writeLog(`writing ${pathFor("provider_locations", runDate)}`);
  await writeStream(
    stream.compose(getProviderLocationsStream(), bufferedGzipStream()),
    pathFor("provider_locations", runDate)
  );

  const logRunDates = await getAvailabilityLogRunDates(runDate);
  for (const logRunDate of logRunDates) {
    const logsExist = await availabilityLogsExist(logRunDate);
    if (!logsExist) {
      writeLog(`no logs for ${pathFor("availability_log", logRunDate)}`);
      continue;
    }

    writeLog(`writing ${pathFor("availability_log", logRunDate)}`);
    await writeStream(
      stream.compose(
        getAvailabilityLogStream(logRunDate),
        bufferedGzipStream()
      ),
      pathFor("availability_log", logRunDate)
    );
  }

  if (clearLog) {
    const clearCutoff = runDate.minus({ days: 7 });
    writeLog(`clearing availability_log rows up to ${formatDate(clearCutoff)}`);
    await deleteLoggedAvailabilityRows(clearCutoff);
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
