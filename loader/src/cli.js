"use strict";

const { pipeline } = require("node:stream/promises");
const { compose } = require("node:stream");
const Sentry = require("@sentry/node");
const yargs = require("yargs");
const { states: allStates } = require("univaf-common");
const { ApiClient } = require("./api-client");
const config = require("./config");
const { sources } = require("./index");
const { Logger } = require("./logging");
const { DEFAULT_STALE_THRESHOLD, StaleChecker } = require("./stale");
const { oneLine } = require("./utils");
const metrics = require("./metrics");

Sentry.init({ release: config.version });

const logger = new Logger();

/**
 * @param {string[]} targets
 * @param {(results: Iterable<any>) => Promise<any>} handler
 * @param {any} options
 * @returns {Promise<{name: string, error?: Error}[]>}
 */
async function runSources(targets, handler, options) {
  targets =
    targets && targets.length ? targets : Object.getOwnPropertyNames(sources);

  const runs = targets.map((name) => {
    const source = sources[name];
    const run = source
      ? pipeline(source.checkAvailability(options), handler)
      : Promise.reject(new Error(`Unknown source: "${name}"`));
    return run
      .then(() => ({ name, error: null }))
      .catch((error) => ({ name, error }));
  });

  return Promise.all(runs);
}

/**
 * Sources can yield a location object or an array of [location, sendOptions].
 * This normalizes the result iterable to always be the array form.
 * @param {AsyncIterable} results
 * @yields {[any, any][]}
 */
async function* normalizeResults(results) {
  for await (const result of results) {
    yield Array.isArray(result) ? result : [result];
  }
}

function createStaleFilter(threshold, filterStaleData) {
  const staleChecker = new StaleChecker({ threshold });
  async function* staleFilter(results) {
    for await (const [location, options] of results) {
      const freshRecord = staleChecker.filterRecord(location);
      if (!filterStaleData || freshRecord) {
        yield [location, options];
      }
    }
  }

  return { staleChecker, staleFilter };
}

function createResultLogger(spacing) {
  async function handler(results) {
    for await (const [location, ..._] of results) {
      const serialized = JSON.stringify(location, null, spacing);
      for (const line of serialized.split("\n")) {
        process.stdout.write(`  ${line}\n`);
      }
    }
  }

  return { handler };
}

function createDatabaseSender() {
  const dbClient = ApiClient.fromEnv();
  const queue = dbClient.updateQueue();
  async function handler(results) {
    for await (const [location, options] of results) {
      queue.push(location, options);
    }
  }

  return { handler, queue };
}

/**
 * The starting point of the script. Runs the requested loaders, then gathers
 * and formats results and errors.
 * @param {any} options
 * @returns {Promise<void>}
 */
async function run(options) {
  Sentry.setContext("CLI Arguments", { ...options });
  metrics.configureMetrics({
    defaultTags: [`sources:${options.sources.join("/")}`],
  });
  metrics.increment("loader.jobs.count");

  const { staleChecker, staleFilter } = createStaleFilter(
    options.staleThreshold,
    options.filterStaleData
  );
  const outputter = options.send
    ? createDatabaseSender()
    : createResultLogger(options.compact ? 0 : 2);
  const handler = compose(normalizeResults, staleFilter, outputter.handler);
  const updateQueue = outputter.queue;

  const startTime = Date.now();
  try {
    const reports = await runSources(options.sources, handler, options);

    if (updateQueue) {
      if (updateQueue.length) {
        logger.info("Waiting for data to finish sending to API...");
      }
      const results = await updateQueue.whenDone();
      logger.info(`Sent ${results.length} updates`);
      let sendStale = 0;
      let sendErrors = 0;
      for (const saveResult of results) {
        if (saveResult.error || saveResult.success === false) {
          // Out-of-date data is not a problem worth alerting.
          if (saveResult.error?.code === "out_of_date") {
            sendStale++;
            continue;
          }

          sendErrors++;
          const data = saveResult.sent;
          logger.error(
            `Error sending: ${saveResult.error?.message || "unknown reason"}`,
            {
              status_code: saveResult.statusCode,
              source: data.availability?.source,
              location_id: data.id,
              location_name: data.name,
            }
          );
        }
      }

      metrics.increment("loader.jobs.send.total", results.length);
      metrics.increment("loader.jobs.send.stale", sendStale);
      metrics.increment("loader.jobs.send.errors", sendErrors);
    }

    let successCount = 0;
    for (const report of reports) {
      if (report.error) {
        logger.error(report.error, { source: report.name });
        process.exitCode = 91;
      } else {
        successCount++;
      }
    }
    if (successCount === 0) {
      process.exitCode = 92;
    }
  } catch (error) {
    process.exitCode = 90;
    logger.error(error);
  } finally {
    const duration = (Date.now() - startTime) / 1000;
    logger.info(`Completed in ${duration} seconds.`);
    metrics.gauge("loader.jobs.duration_seconds", duration);

    staleChecker.printSummary();
    staleChecker.sendMetrics("loader.data");

    await new Promise((resolve, reject) => {
      metrics.flush(resolve, reject);
    }).catch((error) => {
      logger.info("Error flushing metrics:", error);
    });
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

        Exit codes:
        - 90: An unhandled error occurred.
        - 91: An error occurred in one of the requested sources.
        - 92: An error occurred in all of the requested sources.
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
          })
          .option("filter-stale-data", {
            type: "boolean",
            describe: "Don't report records with stale data.",
          })
          .option("stale-threshold", {
            type: "number",
            default: DEFAULT_STALE_THRESHOLD,
            describe: oneLine`
              Consider records older than this many milliseconds to be stale.
            `,
          }),
      handler: run,
    })
    .help()
    .parse();
}

module.exports = { main };
