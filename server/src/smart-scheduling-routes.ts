/**
 * Implements all the routes used by the FHIR SMART Scheduling Links standard.
 * https://github.com/smart-on-fhir/smart-scheduling-links/
 *
 * We support this for testing and interop, but expect most of our users will
 * want the more focused API that provides locations + availability together
 * in a simpler package. We'll see!
 */

import express, {
  NextFunction,
  RequestHandler,
  Request,
  Response,
} from "express";
import states from "./states.json";

interface FhirIssue {
  severity: "fatal" | "error" | "warning" | "information";
  // For codes, see: http://hl7.org/fhir/valueset-issue-type.html
  code: string;
  details?: { text: string };
  diagnostics?: string;
  expression?: Array<string>;
}

/**
 * Respond with a FHIR-compatible error message.
 * @param response The HTTP Response object to send
 * @param status The HTTP status code to use
 * @param error A representation of the error
 */
export function sendFhirError(
  response: Response,
  status: number,
  error: FhirIssue
) {
  // See docs for FHIR errors ("OperationOutcome Resources"):
  // http://hl7.org/fhir/operationoutcome.html
  response
    .status(status)
    .header("Content-Type", "application/fhir+json")
    .json({
      resourceType: "OperationOutcome",
      issue: [error],
    });
}

/**
 * Handler for unimplemented FHIR endpoints.
 */
export function fhirNotImplemented(_req: Request, res: Response) {
  sendFhirError(res, 501, {
    severity: "fatal",
    code: "not-supported",
    details: { text: "Not Implemented" },
  });
}

const statesList = states.filter((state: any) => state.type === "State");

export function manifest(req: Request, res: Response) {
  // XXX: hostUrl should come from configuration
  const hostUrl = `${req.protocol}://${req.hostname}:${req.app.get("port")}`;
  const baseUrl = `${hostUrl}${req.baseUrl}`;
  res.json({
    // TODO: consider making this the latest updated availability timestamp.
    transactionTime: new Date().toISOString(),
    request: `${baseUrl}/$bulk-publish`,
    output: [
      statesList.map((state: any) => ({
        type: "Location",
        url: `${baseUrl}/locations/states/${state.usps}.ndjson`,
        extension: { state: [state.usps] },
      })),
      statesList.map((state: any) => ({
        type: "Schedule",
        url: `${baseUrl}/schedules/states/${state.usps}.ndjson`,
        extension: { state: [state.usps] },
      })),
      statesList.map((state: any) => ({
        type: "Slot",
        url: `${baseUrl}/slots/states/${state.usps}.ndjson`,
        extension: { state: [state.usps] },
      })),
    ].flat(),
    error: [],
  });
}

export function listLocations(req: Request, res: Response) {
  fhirNotImplemented(req, res);
}

export function listSchedules(req: Request, res: Response) {
  fhirNotImplemented(req, res);
}

export function listSlots(req: Request, res: Response) {
  fhirNotImplemented(req, res);
}
