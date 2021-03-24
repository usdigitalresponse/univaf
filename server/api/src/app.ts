import express from "express";
import compression from "compression";  // compresses requests
import * as routes from "./routes";

// Create Express server
const app = express();

// Express configuration
app.set("port", process.env.PORT || 3000);
app.use(compression());

/**
 * Primary app routes.
 */

app.get('/', routes.index);

export default app;
