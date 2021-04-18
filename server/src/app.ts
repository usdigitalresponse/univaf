import express, {
  NextFunction,
  RequestHandler,
  Request,
  Response,
} from "express";
import compression from "compression"; // compresses requests
import cors from "cors";
import errorHandler from "errorhandler";
import * as Sentry from "@sentry/node";
import { authorizeRequest } from "./middleware";
import * as routes from "./routes";
import bodyParser from "body-parser";

Sentry.init();

type PromiseHandler = (
  req: Request,
  res: Response,
  next?: NextFunction
) => void | Promise<any>;

function handleErrors(handler: PromiseHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = handler(req, res, next);
    if (result instanceof Promise) {
      result.catch(next);
    }
  };
}

// Create Express server
const app = express();

// Express configuration
app.set("port", process.env.PORT || 3000);
app.enable("trust proxy");
app.use(Sentry.Handlers.requestHandler());
app.use(compression());
app.use(bodyParser.json());
app.use(cors());
app.use(authorizeRequest);

/**
 * Primary app routes.
 */

app.get("/", (_req: Request, res: Response) =>
  res.send("COVID-19 Appointments")
);
app.get("/debugme", (_req: Request, res: Response) => {
  throw new Error("TESTING SENTRY AGAIN");
});
app.get("/health", routes.healthcheck);
app.get("/locations", handleErrors(routes.list));
app.get("/locations/:id", handleErrors(routes.getById));
// app.get("/availability", handleErrors(routes.listAvailability));
// app.post("/locations", handleErrors(routes.create))
app.post("/update", handleErrors(routes.update));

// FHIR SMART Scheduling Links API ------------------------------------------
// https://github.com/smart-on-fhir/smart-scheduling-links/
import {
  sendFhirError,
  manifest,
  listLocations,
  listSchedules,
  listSlots,
} from "./smart-scheduling-routes";

const smartSchedulingApi = express.Router();
app.use("/smart-scheduling", smartSchedulingApi);

smartSchedulingApi.get("/([$])bulk-publish", handleErrors(manifest));
smartSchedulingApi.get(
  "/locations/states/:state.ndjson",
  handleErrors(listLocations)
);
smartSchedulingApi.get(
  "/schedules/states/:state.ndjson",
  handleErrors(listSchedules)
);
smartSchedulingApi.get("/slots/states/:state.ndjson", handleErrors(listSlots));
smartSchedulingApi.use((_req: Request, res: Response) =>
  sendFhirError(res, 404, {
    severity: "fatal",
    code: "not-found",
  })
);
smartSchedulingApi.use(Sentry.Handlers.errorHandler());
smartSchedulingApi.use(
  (error: any, req: Request, res: Response, _next: NextFunction) => {
    console.error("ERRROR:", error);
    const diagnostics =
      app.get("env") === "development" ? error.stack : undefined;
    sendFhirError(res, 500, {
      severity: "fatal",
      code: "exception",
      diagnostics,
    });
  }
);

// Send unhandled errors to Sentry.io
app.use(Sentry.Handlers.errorHandler());

// In development mode, provide nice stack traces to users
if (app.get("env") === "development") {
  app.use(errorHandler());
} else {
  app.use((error: any, req: Request, res: Response, _next: NextFunction) => {
    console.error("ERRROR:", error);
    res.status(500).json({ error: error.message || error });
  });
}

export default app;
