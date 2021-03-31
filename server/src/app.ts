import express, {
  NextFunction,
  RequestHandler,
  Request,
  Response,
} from "express";
import compression from "compression"; // compresses requests
import { authorizeRequest } from "./middleware";
import * as routes from "./routes";
import bodyParser from "body-parser";

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
app.use(compression());
app.use(bodyParser.json());
app.use(authorizeRequest);

/**
 * Primary app routes.
 */

app.get("/", (_req: Request, res: Response) =>
  res.send("COVID-19 Appointments")
);
app.get("/health", routes.healthcheck);
app.get("/locations", handleErrors(routes.list));
app.get("/locations/:id", handleErrors(routes.getById));
// app.get("/availability", handleErrors(routes.listAvailability));
// app.post("/locations", handleErrors(routes.create))
app.post("/update", handleErrors(routes.update));

// Handle unhandled errors
app.use((error: any, req: Request, res: Response, _next: NextFunction) => {
  console.error("ERRROR:", error);
  res.status(500).json({ error: error.message || error });
});

export default app;
