const { StatsD } = require("hot-shots");
const { getPlatform, isTest } = require("./config");

const globalTags = [];
if (getPlatform()) {
  globalTags.push(`platform:${getPlatform()}`);
}

let metricsClient;

function configureMetricsClient(options = {}) {
  const _oldClient = metricsClient;

  metricsClient = new StatsD({
    ...options,
    globalTags: [...new Set(globalTags.concat(options.globalTags || []))],
    mock: typeof options.mock === "boolean" ? options.mock : isTest,
  });

  if (_oldClient) {
    _oldClient.close();
  }

  return metricsClient;
}

function getMetricsClient() {
  if (!metricsClient) {
    configureMetricsClient();
  }

  return metricsClient;
}

module.exports = {
  configureMetricsClient,
  getMetricsClient,
};
