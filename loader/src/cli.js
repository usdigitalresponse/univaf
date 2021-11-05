"use strict";

const server = require("./server");
const Sentry = require("@sentry/node");
const yargs = require("yargs");
const { ApiClient } = require("./api-client");
const { sources } = require("./index");
const { oneLine } = require("./utils");

Sentry.init();

async function runSources(targets, handler, options) {
  targets =
    targets && targets.length ? targets : Object.getOwnPropertyNames(sources);

  const runs = targets.map((name) => {
    const source = sources[name];
    const run = source
      ? source.checkAvailability(handler, options)
      : Promise.reject(new Error(`Unknown source: "${name}"`));
    return run
      .then((results) => ({ name, error: null, ...results }))
      .catch((error) => ({ name, error, results: [] }));
  });

  return Promise.all(runs);
}

function createResultLogger(spacing) {
  return function logResult(locationData) {
    const serialized = JSON.stringify(locationData, null, spacing);
    for (const line of serialized.split("\n")) {
      process.stdout.write(`  ${line}\n`);
    }
  };
}

let updateQueue = null;

function createDatabaseSender() {
  const client = ApiClient.fromEnv();
  updateQueue = client.updateQueue();
  return function handler(locationData, options) {
    updateQueue.push(locationData, options);
  };
}

// Returns true on success, and false on failure.
async function run(options) {
  let handler;
  if (options.send) {
    handler = createDatabaseSender();
  } else {
    const jsonSpacing = options.compact ? 0 : 2;
    handler = createResultLogger(jsonSpacing);
  }

  let success = true;
  const startTime = Date.now();
  try {
    const reports = await runSources(options.sources, handler, options);

    if (updateQueue) {
      if (updateQueue.length) {
        console.warn("Waiting for data to finish sending to API...");
      }
      const results = await updateQueue.whenDone();
      console.warn(`Sent ${results.length} updates`);
      for (const saveResult of results) {
        if (saveResult.error || saveResult.success === false) {
          // Out-of-date data is not a problem worth alerting.
          if (saveResult.error?.code === "out_of_date") continue;

          const data = saveResult.sent;
          const message = `Error sending: ${
            saveResult.error?.message || "unknown reason"
          }`;
          const logData = {
            status_code: saveResult.statusCode,
            source: data.availability?.source,
            location_id: data.id,
            location_name: data.name,
          };
          console.error(message, JSON.stringify(logData));
          Sentry.captureMessage(message, {
            level: Sentry.Severity.Error,
            contexts: { send_error: logData },
          });
          success = false;
        }
      }
    }

    let successCount = 0;
    for (const report of reports) {
      if (report.error) {
        // TODO: should any errors result in an error being returned?
        console.error(`Error in "${report.name}":`, report.error, "\n");
        Sentry.captureException(report.error);
        process.exitCode = 90;
        success = false;
      } else {
        successCount++;
      }
    }
    if (successCount === 0) {
      process.exitCode = 1;
      success = false;
    }
  } catch (error) {
    console.error(`Error: ${error}`);
    Sentry.captureException(error);
    success = false;
  } finally {
    console.error(`Completed in ${(Date.now() - startTime) / 1000} seconds.`);
  }
  return success;
}

function main() {
  yargs
    .scriptName("univaf-loader")
    .command({
      command: "$0 [sources..]",
      describe: `
        Load data about COVID-19 vaccine appointment availability from a
        variety of different sources.

        Data about each vaccination location is written as a single line of JSON
        on STDOUT, so you can pipe or stream the output to other files or
        programs for processing. Informational messages are available on STDERR.

        Supported sources: ${Object.getOwnPropertyNames(sources).join(", ")}
      `.trim(),
      builder: (yargs) =>
        yargs
          .option("send", {
            type: "boolean",
            describe: oneLine`
              Send availability info to the API specified by the environment
              variable API_URL. If set, data will not be written to STDOUT.
            `,
          })
          .option("compact", {
            type: "boolean",
            describe: "Output JSON as a single line",
          })
          .option("states", {
            type: "string",
            describe: oneLine`
              Comma-separated list of states to query for multi-state sources
              (e.g. vaccinespotter)
            `,
          })
          .option("vaccinespotter-states", {
            type: "string",
            describe: "Overrides the `--states` option for vaccinespotter",
          })
          .option("rite-aid-states", {
            type: "string",
            describe: "Overrides the `--states` option for riteAidApi",
          }),
      handler: run,
    })
    .command({
      command: "server",
      describe: `
        Start a web server that loads vaccine appointment availability when an
        HTTP POST request is made to "/".

        Use the "PORT" environment variable to specify what port to listen on.
      `.trim(),
      handler(options) {
        return server.runServer(run, options);
      },
    })
    .help()
    .parse();
}

module.exports = { main };
