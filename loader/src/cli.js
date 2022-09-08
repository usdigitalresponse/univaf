"use strict";

const Sentry = require("@sentry/node");
const yargs = require("yargs");
const { ApiClient } = require("./api-client");
const config = require("./config");
const { sources } = require("./index");
const { oneLine } = require("./utils");
const allStates = require("./states.json");

Sentry.init({ release: config.version });

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

/**
 * The starting point of the script. Runs the requested loaders, then gathers
 * and formats results and errors.
 * @param {any} options
 * @returns {Promise<void>}
 */
async function run(options) {
  Sentry.setContext("CLI Arguments", { ...options });

  let handler;
  if (options.send) {
    handler = createDatabaseSender();
  } else {
    const jsonSpacing = options.compact ? 0 : 2;
    handler = createResultLogger(jsonSpacing);
  }

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
            level: "error",
            contexts: { send_error: logData },
          });
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
              (e.g. cvsSmart). If not specified all relevant states for the
              requested sources will be checked.
            `,
            coerce(value) {
              const invalid = [];
              const parsed = value
                .split(",")
                .map((state) => {
                  const stateText = state.trim().toUpperCase();
                  if (
                    !stateText ||
                    !allStates.find((item) => item.usps === stateText)
                  ) {
                    invalid.push(state);
                  }
                  return stateText;
                })
                .filter(Boolean);

              if (invalid.length) {
                const quoted = invalid.map((x) => `"${x}"`).join(", ");
                throw new Error(`Unsupported states: ${quoted}`);
              }

              return parsed;
            },
          })
          .option("hide-missing-locations", {
            type: "boolean",
            describe: oneLine`
              If a previously found location stops being returned by a source,
              output it with \`is_public: false\`. Only use this with sources
              that are "authoritative" -- that is, you expect them to output a
              *complete* list of whatever type of locations they cover.
              ("Previously found" locations are loaded from the server specified
              by the API_URL environment variable. This is currently only
              supported by the \`prepmod\` source.)
            `,
          })
          .option("rate-limit", {
            type: "number",
            describe: oneLine`
              Only make this many HTTP requests per second. (Only applies to
              the Rite Aid sources for now.)
            `,
            coerce(value) {
              if (isNaN(value) || value < 0) {
                throw new Error(`--rate-limit must be a positive number.`);
              }
            },
          }),
      handler: run,
    })
    .help()
    .parse();
}

module.exports = { main };
