import express, { NextFunction, Request, Response } from "express";
import compression from "compression"; // compresses requests
import cors from "cors";
import errorHandler from "errorhandler";
import * as Sentry from "@sentry/node";
import * as Tracing from "@sentry/tracing";
import { RELEASE } from "./config";
import {
  AppRequest,
  authorizeRequest,
  parseJsonBody,
  versionedMiddleware,
} from "./middleware";
import { datadogMiddleware } from "./datadog";
import { logger, logStackTrace } from "./logger";
import * as apiEdge from "./api/edge";
import * as apiLegacy from "./api/legacy";
import { asyncHandler, urlDecodeSpecialPathChars } from "./utils";

// TODO: we should use a proper logging library (e.g. Winston) which has
// plugins and extensions for this, and will gather better data.
function logRequest(request: Request, response: Response, next: NextFunction) {
  logger.debug(`${response.statusCode} ${request.method} ${request.url}`);
  next();
}

function cacheControlMaxAge(seconds: number) {
  return function (
    request: AppRequest,
    response: Response,
    next: NextFunction
  ) {
    if (request.method == "GET") {
      const directives = [
        request.authorization ? "private" : "public",
        `max-age=${seconds}`,
      ];
      response.set("Cache-Control", directives.join(", "));
    }
    next();
  };
}

// Express configuration -----------------------------------------

const app = express();
app.set("port", process.env.PORT || 3000);
// We are behind AWS ELBs which set reverse-proxy related headers.
app.enable("trust proxy");
// Don't advertise that we are Express-based in case someone is scanning for
// servers with exploitable vulnerabilities.
app.disable("x-powered-by");

Sentry.init({
  // Sentry's session tracking keeps the process running, which causes tests to
  // hang. We don't really need session tracking, so turn it off.
  autoSessionTracking: false,
  ignoreTransactions: ["/health", "/debugme"],
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Tracing.Integrations.Express({ app }),
  ],
  release: RELEASE,
});

// Middleware ----------------------------------------------------

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());
app.use(logRequest);
app.use(datadogMiddleware);
app.use(compression());
app.use(parseJsonBody({ limit: "2.5mb" }));
app.use(cors());
app.use(authorizeRequest);
app.use(urlDecodeSpecialPathChars);

// Diagnostic Routes ---------------------------------------------

app.get("/health", (req: Request, res: Response) => {
  // TODO: include the db status before declaring ourselves "up"
  res.status(200).send("OK!");
});

if (app.get("env") !== "production") {
  // Use this route to test error handlers.
  app.get("/debugme", (_req: Request, _res: Response) => {
    throw new Error("This is an error from a route handler");
  });
}

// Primary app routes --------------------------------------------

app.get("/", (_req: Request, res: Response) => res.redirect("/docs/"));

// Caching -------------------------------------------------------
const shortCacheTime = 10;
const longCacheTime = 60 * 10;
app.use("/", cacheControlMaxAge(longCacheTime));
app.use("/locations", cacheControlMaxAge(shortCacheTime));
app.use("/api", cacheControlMaxAge(shortCacheTime));
app.use("/smart-scheduling", cacheControlMaxAge(shortCacheTime));

// Documentation -------------------------------------------------
app.use("/docs", express.static("public/docs"));

// Version handling ----------------------------------------------
app.use("/", versionedMiddleware);

// Legacy top-level API ------------------------------------------
// TODO: Remove these when we're confident people aren't using them.
app.get("/locations", asyncHandler(apiLegacy.list));
app.get("/locations/:id", (req: Request, res: Response) => {
  res.redirect(`/api/edge/locations/${req.params.id}`);
});
// Note this one uses the newer edge API to ease our transition.
app.post("/update", asyncHandler(apiEdge.update));

// Current, non-stable API ------------------------------------------
app.get("/api/edge/locations", asyncHandler(apiEdge.list));
app.get("/api/edge/locations.ndjson", asyncHandler(apiEdge.listStream));
app.get("/api/edge/locations/:id", asyncHandler(apiEdge.getById));
app.get("/api/edge/availability", asyncHandler(apiEdge.listAvailability));
// app.get("/api/edge/availability.ndjson", asyncHandler(apiEdge.listAvailabilityStream));
app.post("/api/edge/update", asyncHandler(apiEdge.update));

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

smartSchedulingApi.get("/([$])bulk-publish", asyncHandler(manifest));
smartSchedulingApi.get(
  "/locations/states/:state.ndjson",
  asyncHandler(listLocations)
);
smartSchedulingApi.get(
  "/schedules/states/:state.ndjson",
  asyncHandler(listSchedules)
);
smartSchedulingApi.get("/slots/states/:state.ndjson", asyncHandler(listSlots));
smartSchedulingApi.use((_req: Request, res: Response) =>
  sendFhirError(res, 404, {
    severity: "fatal",
    code: "not-found",
  })
);
smartSchedulingApi.use(Sentry.Handlers.errorHandler());
smartSchedulingApi.use(
  (error: any, req: Request, res: Response, _next: NextFunction) => {
    logStackTrace(logger, error);
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
    logStackTrace(logger, error);

    // Get status code from error. This is stolen from Sentry.
    const errorStatus =
      error &&
      (error.httpStatus ||
        error.status ||
        error.statusCode ||
        error.status_code ||
        (error.output && error.output.statusCode));
    const statusCode = errorStatus && parseInt(errorStatus as string, 10);

    if (statusCode) {
      res.status(statusCode).json({
        error: { message: error.message, code: error.code },
      });
    } else {
      res.status(500).json({
        error: { message: "Unknown error", code: "unknown_error" },
      });
    }
  });

  app.use(function (req, res, next) {
    if (req.accepts("json")) {
      res.status(404).json({
        error: { message: "Not Found", code: "not_found" },
      });
    } else {
      next();
    }
  });
}

export default app;
