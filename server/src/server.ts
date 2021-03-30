import errorHandler from "errorhandler";
import app from "./app";
import process from "process";

/**
 * Error Handler. Provides full stack
 */
if (process.env.NODE_ENV === "development") {
  app.use(errorHandler());
}

/**
 * Kill on SIGINT
 */

process.on("SIGINT", () => {
  console.log("Received SIGINT: process exiting");
  connection.end()
    .then(() => process.exit(0))
    .catch(error => { console.error(error); process.exit(1); });
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
