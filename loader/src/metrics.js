const {
  init,
  gauge,
  increment,
  histogram,
  flush,
  reporters,
} = require("datadog-metrics");
const Sentry = require("@sentry/node");
const { getPlatform, isTest } = require("./config");

const globalTags = [];
if (getPlatform()) {
  globalTags.push(`platform:${getPlatform()}`);
}

const apiKey = process.env.DD_API_KEY;

function configureMetrics(options = {}) {
  init({
    apiKey,
    ...options,
    defaultTags: [...new Set(globalTags.concat(options.defaultTags || []))],
    reporter: isTest || !apiKey ? new reporters.NullReporter() : undefined,
    onError(error) {
      Sentry.captureException(error);
    },
  });
}

// Automatically configure for the current environment. `configureMetrics()`
// can be called again by other code to override this.
configureMetrics();

module.exports = {
  configureMetrics,
  gauge,
  increment,
  histogram,
  flush,
};
