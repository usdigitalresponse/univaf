const getStream = require("get-stream");
const http = require("http");
const process = require("process");
const Sentry = require("@sentry/node");

const hostname = "0.0.0.0";
const port = process.env.PORT || 3010;
let server = null;

function shutdown(signal) {
  return (err) => {
    console.log(`${signal}: shutting down server...`);
    const isSignal = typeof err === "string" && err.startsWith("SIG");
    if (!isSignal) console.error(err.stack || err);

    setTimeout(() => {
      console.log("...waited 5s, exiting.");
      process.exit(err ? 1 : 0);
    }, 5000).unref();

    if (server) server.close();
  };
}

/**
 * Start an HTTP server that loads data from a set of sources on request.
 * Make a POST request to "/" in order to run some sources. The body should be
 * a JSON object with similar fields to the command-line version of the app.
 * E.g:
 *
 *     { "sources": ["vaccinespotter", "cvsApi", "njvss"] }
 *
 * The `send` field will default to `true`.
 *
 * @param {(any) => boolean} runFunc Function that runs a set of sources and
 *        returns a boolean indicating whether they succeeded.
 * @param {any} options CLI options to start the server or run the sources with.
 */
function runServer(runFunc, options) {
  process
    .on("SIGTERM", shutdown("SIGTERM"))
    .on("SIGINT", shutdown("SIGINT"))
    .on("uncaughtException", shutdown("uncaughtException"));

  server = http.createServer(async (request, res) => {
    res.setHeader("Content-Type", "text/plain");

    let data;
    try {
      const body = await getStream(request, { encoding: "utf8" });
      data = JSON.parse(body || "{}");
      if (!data || !(typeof data === "object") || Array.isArray(data)) {
        throw new Error("Body was not an object");
      }
    } catch (error) {
      res.statusCode = 400;
      res.end("Invalid request body! Please POST a JSON object.");
      return;
    }

    console.log(`[${new Date().toISOString()}] Received POST data:`, data);

    let success = false;
    try {
      success = await runFunc({ options, send: true, ...data, compact: true });
    } catch (error) {
      // `runFunc()` should always handle errors itself, but just in case...
      console.error(error);
      Sentry.captureException(error);
    }
    res.statusCode = success ? 200 : 500;
    res.end(`Success: ${success}`);
  });

  server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
  });

  return server;
}

module.exports = { runServer };
