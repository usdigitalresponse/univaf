import app from "./app";
import process from "process";
import { db } from "./db";
import { logger, logStackTrace } from "./logger";

const port = app.get("port");
const env = app.get("env");

/**
 * Kill on SIGINT
 */

process.on("SIGINT", () => {
  logger.info("Received SIGINT: process exiting...");
  db.destroy()
    .then(() => process.exit(0))
    .catch((error: Error) => {
      logStackTrace(logger, error);
      process.exit(1);
    });
});

/**
 * Start Express server.
 */
const server = app.listen(port, () => {
  logger.info(`App is running at http://localhost:${port} in ${env} mode`);
  logger.info("Press CTRL-C to stop\n");
});

export default server;
