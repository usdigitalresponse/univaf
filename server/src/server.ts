import app from "./app";
import process from "process";
import { db } from "./db";
import { logger, logStackTrace } from "./logger";
import { availabilityDb } from "./availability-log";

const port = app.get("port");
const env = app.get("env");

/**
 * Shutdown gracefully on SIGINT/SIGTERM/etc.
 */
function handleSignal(signal = "signal") {
  // Unhook handler so a second signal will immediately kill the process.
  process.removeAllListeners(signal);

  function hardShutdown(error: Error) {
    logStackTrace(logger, error);
    process.exit(1);
  }

  logger.info(`Received ${signal}: process exiting...`);
  server.close((error: Error) => {
    if (error) {
      hardShutdown(error);
    }

    Promise.all([db.destroy(), availabilityDb.destroy()])
      .then(() => process.kill(process.pid, signal))
      .catch(hardShutdown);
  });
}

process.on("SIGINT", handleSignal);
process.on("SIGTERM", handleSignal);
process.on("SIGBREAK", handleSignal);

/**
 * Start Express server.
 */
const server = app.listen(port, () => {
  logger.info(`Server is running at http://localhost:${port} in ${env} mode`);
  logger.info("Press CTRL-C to stop\n");
});

export default server;
