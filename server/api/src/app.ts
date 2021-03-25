import express from "express";
import compression from "compression"; // compresses requests
import * as routes from "./routes";
import bodyParser from "body-parser";

// Create Express server
const app = express();

// Express configuration
app.set("port", process.env.PORT || 3000);
app.use(compression());
app.use(bodyParser.json());

/**
 * Primary app routes.
 */

app.get("/", routes.list);
app.get("/provider/:id", routes.getById);
app.post("/update", routes.update);

export default app;
