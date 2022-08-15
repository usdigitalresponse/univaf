import app from "./app";
import { createHttpTerminator } from "http-terminator";
import process from "process";
import { db } from "./db";
import { logger, logStackTrace } from "./logger";
import { availabilityDb } from "./availability-log";

const port = app.get("port");
const env = app.get("env");

/**
 * Shutdown gracefully on SIGINT/SIGTERM/etc.
 */
async function handleSignal(signal = "signal") {
  // Unhook handler so a second signal will immediately kill the process.
  process.removeAllListeners(signal);

  logger.info(`Received ${signal}: process exiting...`);
  try {
    await serverTerminator.terminate();
    await Promise.all([db.destroy(), availabilityDb.destroy()]);
    process.kill(process.pid, signal);
  } catch (error) {
    logStackTrace(logger, error);
    process.exit(1);
  }
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

const serverTerminator = createHttpTerminator({
  gracefulTerminationTimeout: 10_000,
  server,
});

export default server;
