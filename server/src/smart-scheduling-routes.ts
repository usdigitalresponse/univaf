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
import * as db from "./db";
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

export async function listLocations(req: Request, res: Response) {
  let index = 1;
  let where: Array<string> = [];
  let values = [];
  if (req.params.state) {
    where.push(`state = $${index++}`);
    values.push(req.params.state);
  }

  const providers = await db.listLocations({ where, values });
  res.header("Content-Type", "application/fhir+ndjson").send(
    providers
      .map((provider) => {
        // For simplicity, use the `booking_*` fields here, even though it
        // should theoretically be the `info_*` fields.
        const telecom = [];
        if (provider.booking_phone) {
          telecom.push({
            system: "phone",
            value: provider.booking_phone,
          });
        }
        if (provider.booking_url) {
          telecom.push({
            system: "url",
            value: provider.booking_url,
          });
        }

        return JSON.stringify({
          resourceType: "Location",
          id: provider.id,
          identifier: Object.entries(provider.external_ids || {}).map(
            ([key, value]) => ({
              system:
                key === "vtrcks"
                  ? "https://cdc.gov/vaccines/programs/vtrcks"
                  : `https://fhir.usdigitalresponse.org/identifiers/${key}`,
              value,
            })
          ),
          name: provider.name,
          description: provider.description,
          telecom: telecom.length ? telecom : undefined,
          address: {
            line: provider.address_lines,
            city: provider.city,
            state: provider.state,
            postalCode: provider.postal_code,
            district: provider.county,
          },
          position: provider.position,
          meta: {
            lastUpdated: provider.updated_at.toISOString(),
          },
          // TODO: use extensions to expose additional info?
          // - provider
          // - location_type
          // - eligibility
          // - requires_waitlist
          // - meta
        });
      })
      .join("\n")
  );
}

export async function listSchedules(req: Request, res: Response) {
  let index = 1;
  let where: Array<string> = [];
  let values = [];
  if (req.params.state) {
    where.push(`state = $${index++}`);
    values.push(req.params.state);
  }

  const providers = await db.listLocations({ where, values });
  res.header("Content-Type", "application/fhir+ndjson").send(
    providers
      .map((provider) => {
        return JSON.stringify({
          resourceType: "Schedule",
          id: `${provider.id}__covid19vaccine`,
          serviceType: [
            {
              coding: [
                {
                  system: "http://terminology.hl7.org/CodeSystem/service-type",
                  code: "57",
                  display: "Immunization",
                },
                {
                  system:
                    "http://fhir-registry.smarthealthit.org/CodeSystem/service-type",
                  code: "covid19-immunization",
                  display: "COVID-19 Immunization Appointment",
                },
              ],
            },
          ],
          actor: [
            {
              reference: `Location/${provider.id}`,
            },
          ],
        });
      })
      .join("\n")
  );
}

export async function listSlots(req: Request, res: Response) {
  fhirNotImplemented(req, res);
}
