import app from "./app";
import process from "process";
import { db } from "./db";
import { logger } from "./logger";

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
  logger.log('info',
    "App is running at http://localhost:%s in %s mode",
    app.get("port"),
    app.get("env")
  );
  logger.info("Press CTRL-C to stop\n");
});

export default server;
