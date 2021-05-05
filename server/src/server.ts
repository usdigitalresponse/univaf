import app from "./app";
import process from "process";
import { db } from "./db";

/**
 * Kill on SIGINT
 */

process.on("SIGINT", () => {
  console.log("Received SIGINT: process exiting...");
  db.destroy()
    .then(() => process.exit(0))
    .catch((error: Error) => {
      console.error(error);
      process.exit(1);
    });
});

/**
 * Start Express server.
 */
const server = app.listen(app.get("port"), () => {
  console.log(
    "  App is running at http://localhost:%d in %s mode",
    app.get("port"),
    app.get("env")
  );
  console.log("  Press CTRL-C to stop\n");
});

export default server;
