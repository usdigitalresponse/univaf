import app from "./app";
import process from "process";
import { db } from "./db";
import { logger } from "./config";

/**
 * Kill on SIGINT
 */

process.on("SIGINT", () => {
  logger.info("Received SIGINT: process exiting...");
  db.destroy()
    .then(() => process.exit(0))
    .catch((error: Error) => {
      logger.error(error);
      process.exit(1);
    });
});

/**
 * Start Express server.
 */
const server = app.listen(app.get("port"), () => {
  logger.info(`App is running at http://localhost:${app.get("port")} in ${app.get("env")} mode`);
  logger.info("Press CTRL-C to stop\n");
});

export default server;
