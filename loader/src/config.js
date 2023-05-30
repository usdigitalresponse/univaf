const packageInfo = require("../package.json");

// TODO: share the logic for getting the release/version with the server.
const version =
  process.env.RELEASE ||
  process.env.COMMIT_REF ||
  process.env.COMMIT_SHA ||
  process.env.COMMIT_HASH ||
  // Render
  process.env.RENDER_GIT_COMMIT ||
  // GitHub Actions
  process.env.GITHUB_SHA ||
  // We don't necessarily bump this whenever we update, so it's only a fallback.
  packageInfo.version;

const userAgent = `univaf-loader/${version} (+https://github.com/usdigitalresponse/univaf)`;

/**
 * Get the infrastructure platform the process is running in, if possible. If
 * the platform is unknown, returns an empty string.
 * @returns {"render" | "ecs" | ""}
 */
function getPlatform() {
  if (process.env.RENDER) {
    return "render";
  } else if (
    process.env.ECS_CONTAINER_METADATA_URI ||
    process.env.ECS_CONTAINER_METADATA_URI_V4
  ) {
    return "ecs";
  } else {
    return "";
  }
}

module.exports = {
  apiUrl: process.env.API_URL,
  apiKey: process.env.API_KEY,
  apiConcurrency: parseInt(process.env.API_CONCURRENCY) || 0,
  debug: !!process.env.DEBUG || process.argv.includes("--verbose"),
  getPlatform,
  isTest: process.env.NODE_ENV?.toLowerCase() === "test",
  version,
  userAgent,
};
