"use strict";

const Sentry = require("@sentry/node");
const yargs = require("yargs");
const ApiClient = require("./api-client");
const { sources } = require("./index");

Sentry.init();

async function runSources(targets, handler, options) {
  targets = targets.length ? targets : Object.getOwnPropertyNames(sources);

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

const inFlightResults = [];

function createDatabaseSender() {
  const client = ApiClient.fromEnv();
  return function handler(locationData) {
    inFlightResults.push(client.sendUpdate(locationData));
  };
}

function compoundHandler(...handlers) {
  return function handler(locationData) {
    handlers.forEach((handle) => handle(locationData));
  };
}

async function run(options) {
  const jsonSpacing = options.compact ? 0 : 2;

  let handler = createResultLogger(jsonSpacing);
  if (options.send) {
    handler = compoundHandler(handler, createDatabaseSender());
  }

  const startTime = Date.now();
  try {
    const reports = await runSources(options.sources, handler, options);

    if (inFlightResults.length > 0) {
      console.warn("Waiting for data to finish sending to API...");
      const saveResults = await Promise.all(inFlightResults);
      for (const saveResult of saveResults) {
        if (saveResult.success === false) {
          const data = saveResult.sent;
          const source = data.availability
            ? ` from ${data.availability.source}`
            : "";
          const message = `Error sending "${data.name}"${source}: ${
            saveResult.statusCode
          } ${saveResult.error || "unknown reason"}`;
          console.error(message);
          Sentry.captureMessage(message, Sentry.Severity.Error);
        }
      }
    }

    let successCount = 0;
    for (let report of reports) {
      if (report.error) {
        console.error(`Error in "${report.name}":`, report.error, "\n");
        Sentry.captureException(report.error);
        process.exitCode = 90;
      } else {
        successCount++;
      }
    }
    if (successCount === 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Error: ${error}`);
    Sentry.captureException(error);
  } finally {
    console.error(`Completed in ${(Date.now() - startTime) / 1000} seconds.`);
  }
}

function main() {
  yargs
    .scriptName("appointment-availability-loader")
    .command({
      command: "$0 [sources..]",
      describe: `
        Load data about COVID-19 vaccine appointment availability from a
        variety of different sources.

        Supported sources: ${Object.getOwnPropertyNames(sources).join(", ")}
      `.trim(),
      builder: (yargs) =>
        yargs
          .option("send", {
            type: "boolean",
            describe:
              "Send availability info to the API specified by the environment variable API_URL",
          })
          .option("compact", {
            type: "boolean",
            describe: "Output JSON as a single line",
          })
          .option("states", {
            type: "string",
            describe:
              "Comma-separated list of states to query for multi-state sources (e.g. vaccinespotter)",
          })
          .option("vaccinespotter-states", {
            type: "string",
            describe: "Overrides the `--states` option for vaccinespotter",
          }),
      handler: run,
    })
    .help().argv;
}

module.exports = { main };
