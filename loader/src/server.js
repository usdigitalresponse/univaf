const getStream = require("get-stream");
const http = require("http");
const process = require("process");
const Sentry = require("@sentry/node");

const hostname = "0.0.0.0";
const port = process.env.PORT || 3010;
const shutdownSignals = ["SIGTERM", "SIGINT"];
let server = null;

function handleError(error, origin) {
  console.error(error.stack || error);
  shutdownServer(origin, () => process.exit(1));
}

function handleSignal(signal) {
  // Unhook handlers to allow the signal to kill the process after we're done.
  // (Bash expects a program sent a signal to kill itself with that same
  // signal, and handles it poorly if done differently.)
  process.removeAllListeners(signal);
  shutdownServer(signal, () => process.kill(process.pid, signal));
}

/**
 * Shut down the currently running server and run a callback. If the server
 * does not shut down within 5 seconds, call the callback anyway.
 * @param {string} reason Reason for shutting down
 * @param {() => void} callback Function to call after the server has shut down
 *        or after it’s failed to shut down after some period of time.
 */
function shutdownServer(reason, callback) {
  console.log(`Received ${reason}: shutting down server...`);

  setTimeout(() => {
    console.log("...waited 5s, exiting.");
    callback();
  }, 5000).unref();

  if (server) server.close(callback);
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

  // Handle errors and signals gracefully for lifetime of server.
  for (const signal in shutdownSignals) process.on(signal, handleSignal);
  process.on("uncaughtException", handleError);
  server.on("close", () => {
    for (const signal in shutdownSignals) process.off(signal, handleSignal);
    process.off("uncaughtException", handleError);
  });

  return server;
}

module.exports = { runServer };
