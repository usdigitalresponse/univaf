const packageInfo = require("../package.json");

const version =
  process.env.RELEASE ||
  process.env.COMMIT_REF ||
  process.env.COMMIT_SHA ||
  process.env.COMMIT_HASH ||
  // GitHub Actions
  process.env.GITHUB_SHA ||
  // We don't necessarily bump this whenever we update, so it's only a fallback.
  packageInfo.version;

const userAgent = `univaf-loader/${version} (+https://github.com/usdigitalresponse/univaf)`;

module.exports = {
  apiUrl: process.env.API_URL,
  apiKey: process.env.API_KEY,
  apiConcurrency: parseInt(process.env.API_CONCURRENCY) || 0,
  version,
  userAgent,
};
