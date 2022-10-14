const { init, gauge, increment, histogram, flush } = require("datadog-metrics");
const { getPlatform, isTest } = require("./config");

const globalTags = [];
if (getPlatform()) {
  globalTags.push(`platform:${getPlatform()}`);
}

const apiKey = process.env.DD_API_KEY;

const nullReporter = {
  report(_metrics, onSuccess) {
    if (onSuccess) onSuccess();
  },
};

function configureMetrics(options = {}) {
  init({
    apiKey,
    ...options,
    defaultTags: [...new Set(globalTags.concat(options.defaultTags || []))],
    reporter: isTest || !apiKey ? nullReporter : undefined,
  });
}

module.exports = {
  configureMetrics,
  gauge,
  increment,
  histogram,
  flush,
};
