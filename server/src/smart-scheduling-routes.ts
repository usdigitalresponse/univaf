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
import { getHostUrl } from "./config";
import * as db from "./db";
import { Availability } from "./interfaces";
import states from "./states.json";

const CURRENT_AS_OF = "http://usds.gov/vaccine/currentAsOf";
const VTRCKS = "https://cdc.gov/vaccines/programs/vtrcks";
const SERVICE_TYPE_HL7 = "http://terminology.hl7.org/CodeSystem/service-type";
const SERVICE_TYPE_SMART =
  "http://fhir-registry.smarthealthit.org/CodeSystem/service-type";
const SLOT_CAPACITY =
  "http://fhir-registry.smarthealthit.org/StructureDefinition/slot-capacity";

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
  const baseUrl = `${getHostUrl(req)}${req.baseUrl}`;
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
  let where: Array<string> = [];
  let values = [];
  if (req.params.state) {
    where.push(`state = ?`);
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
                  ? VTRCKS
                  : `https://fhir.usdigitalresponse.org/identifiers/${key}`,
              value: value.toString(),
            })
          ),
          name: provider.name,
          description: provider.description || undefined,
          telecom: telecom.length ? telecom : undefined,
          address: {
            line: provider.address_lines,
            city: provider.city,
            state: provider.state,
            postalCode: provider.postal_code,
            district: provider.county || undefined,
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
  let where: Array<string> = [];
  let values = [];
  if (req.params.state) {
    where.push(`state = ?`);
    values.push(req.params.state);
  }

  const providers = await db.listLocations({ where, values });
  res.header("Content-Type", "application/fhir+ndjson").send(
    providers
      .map((provider) => {
        return JSON.stringify({
          resourceType: "Schedule",
          // NOTE: high likelihood of going over the max length here.
          id: `${provider.id}__covid19vaccine`,
          serviceType: [
            {
              coding: [
                {
                  system: SERVICE_TYPE_HL7,
                  code: "57",
                  display: "Immunization",
                },
                {
                  system: SERVICE_TYPE_SMART,
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
  let where: Array<string> = [];
  let values = [];
  if (req.params.state) {
    where.push(`state = ?`);
    values.push(req.params.state);
  }

  const providers = await db.listLocations({ where, values });
  res.header("Content-Type", "application/fhir+ndjson").send(
    providers
      .map((provider) => {
        // Status can only be "busy" or "free", which doesn't cover concept of
        // "unknown" status. Instead, "unknown" with status = "free" and
        // capacity = 0.
        let capacity = 0;
        let status = "free";
        if (provider.availability?.available === Availability.NO) {
          status = "busy";
        } else if (provider.availability?.available === Availability.YES) {
          capacity = 1;
        }

        const extension: Array<any> = [
          {
            url: SLOT_CAPACITY,
            valueInteger: capacity,
          },
        ];
        if (provider.availability?.valid_at) {
          extension.push({
            url: CURRENT_AS_OF,
            valueInstant: provider.availability.valid_at,
          });
        }

        return JSON.stringify({
          resourceType: "Slot",
          // NOTE: high likelihood of going over the max length here.
          id: `${provider.id}__covid19vaccine_combined_slot`,
          schedule: {
            reference: `Schedule/${provider.id}__covid19vaccine`,
          },
          status,
          // These times are a lie. For most providers, we have no detailed
          // slot information beyond "yes/no/unknown appointments available at
          // some future time".
          // TODO: provide more detail here when we have it.
          start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          end: new Date(Date.now() + 32 * 60 * 60 * 1000).toISOString(),
          extension,
        });
      })
      .join("\n")
  );
}
