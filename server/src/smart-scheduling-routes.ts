/**
 * Implements all the routes used by the FHIR SMART Scheduling Links standard.
 * https://github.com/smart-on-fhir/smart-scheduling-links/
 *
 * We support this for testing and interop, but expect most of our users will
 * want the more focused API that provides locations + availability together
 * in a simpler package. We'll see!
 */

import { Request, Response } from "express";
import { DateTime } from "luxon";
import { getPrimaryHost } from "./config";
import { getRequestHost } from "./utils";
import * as db from "./db";
import {
  Availability,
  LocationAvailability,
  SlotRecord,
  CapacityRecord,
} from "./interfaces";
import states from "./states.json";

const BOOKING_DEEP_LINK =
  "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-deep-link";
const BOOKING_PHONE =
  "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-phone";

const VTRCKS = "https://cdc.gov/vaccines/programs/vtrcks";

const SYSTEM_CVX = "http://hl7.org/fhir/sid/cvx";

const SERVICE_TYPE_HL7 = "http://terminology.hl7.org/CodeSystem/service-type";
const SERVICE_TYPE_SMART =
  "http://fhir-registry.smarthealthit.org/CodeSystem/service-type";

const EXTENSION_HAS_AVAILABILITY =
  "http://fhir-registry.smarthealthit.org/StructureDefinition/has-availability";
const EXTENSION_LAST_SOURCE_SYNC =
  "http://hl7.org/fhir/StructureDefinition/lastSourceSync";
const EXTENSION_SLOT_CAPACITY =
  "http://fhir-registry.smarthealthit.org/StructureDefinition/slot-capacity";
const EXTENSION_VACCINE_DOSE =
  "http://fhir-registry.smarthealthit.org/StructureDefinition/vaccine-dose";
const EXTENSION_VACCINE_PRODUCT =
  "http://fhir-registry.smarthealthit.org/StructureDefinition/vaccine-product";

// https://www.cdc.gov/vaccines/programs/iis/COVID-19-related-codes.html
const CVX_CODES: { [index: string]: number } = {
  astra_zeneca: 210,
  jj: 212,
  moderna: 207,
  moderna_age_6_11: 227,
  moderna_age_0_5: 228,
  novavax: 211,
  pfizer: 208,
  pfizer_age_5_11: 218,
  pfizer_age_2_4: 219,
  sanofi: 225,
};

const PRODUCT_NAMES: { [index: string]: string } = {
  astra_zeneca: "AstraZeneca",
  jj: "Johnson & Johnson",
  moderna: "Moderna",
  moderna_age_6_11: "Moderna Pediatric (Ages 6-11)",
  moderna_age_0_5: "Moderna Pediatric (Ages 0-5)",
  novavax: "NovaVax",
  pfizer: "Pfizer",
  pfizer_age_5_11: "Pfizer Pediatric (Ages 5-11)",
  pfizer_age_2_4: "Pfizer Pediatric (Ages 0-4)",
  sanofi: "Sanofi Pasteur",
};

const DOSE_NUMBERS: { [index: string]: number[] } = {
  all_doses: [1, 2],
  first_dose_only: [1],
  second_dose_only: [2],
};

const INVALID_ID_CHARACTERS = /[^A-Z\d.-]/gi;

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
): void {
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
export function fhirNotImplemented(_req: Request, res: Response): void {
  sendFhirError(res, 501, {
    severity: "fatal",
    code: "not-supported",
    details: { text: "Not Implemented" },
  });
}

const statesList = states.filter((state: any) => state.type === "State");

export function manifest(req: Request, res: Response): void {
  const host = getPrimaryHost() || getRequestHost(req);
  const baseUrl = `${req.protocol}://${host}${req.baseUrl}`;
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

export async function listLocations(
  req: Request,
  res: Response
): Promise<void> {
  const where: Array<string> = [];
  const values = [];
  if (req.params.state) {
    where.push(`state = ?`);
    values.push(req.params.state);
  }

  const providers = await db.listLocations({ where, values });
  res.header("Content-Type", "application/fhir+ndjson").send(
    providers
      .map((provider) => {
        // Technically, these should really be the `info_*` fields. However,
        // sometimes we only have `booking_*` fields, so fall back to those.
        const telecom = [];
        if (provider.info_phone || provider.booking_phone) {
          telecom.push({
            system: "phone",
            value: provider.info_phone || provider.booking_phone,
          });
        }
        if (provider.info_url || provider.booking_url) {
          telecom.push({
            system: "url",
            value: provider.info_url || provider.booking_url,
          });
        }

        return JSON.stringify({
          resourceType: "Location",
          id: provider.id,
          identifier: provider.external_ids.map(([key, value]) => ({
            system:
              key === "vtrcks"
                ? VTRCKS
                : `https://fhir.usdigitalresponse.org/identifiers/${key}`,
            value: value.toString(),
          })),
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
          position: provider.position || undefined,
          meta: {
            lastUpdated: provider.updated_at.toISOString(),
          },
          // TODO: use extensions to expose additional info?
          // - provider
          // - location_type
          // - requires_waitlist
          // - meta
        });
      })
      .join("\n")
  );
}

function formatHasAvailability(availability: LocationAvailability): string {
  switch (availability?.available) {
    case Availability.YES:
      return "some";
    case Availability.NO:
      return "none";
    default:
      return "unknown";
  }
}

export async function listSchedules(
  req: Request,
  res: Response
): Promise<void> {
  const where: Array<string> = [];
  const values = [];
  if (req.params.state) {
    where.push(`state = ?`);
    values.push(req.params.state);
  }

  const providers = await db.listLocations({ where, values });
  res.header("Content-Type", "application/fhir+ndjson").send(
    providers
      .map((provider) => {
        const extension: any[] = [
          {
            url: EXTENSION_HAS_AVAILABILITY,
            valueCode: formatHasAvailability(provider.availability),
          },
        ];

        // TODO: produce separate schedules for each combination of products
        // and dose that appear in `availability.slots/capacity`.
        if (provider.availability?.products) {
          for (const product of provider.availability.products) {
            extension.push({
              url: EXTENSION_VACCINE_PRODUCT,
              valueCoding: {
                system: SYSTEM_CVX,
                code: CVX_CODES[product],
                display: PRODUCT_NAMES[product],
              },
            });
          }
        }
        if (provider.availability?.doses) {
          const doseNumbers = new Set(
            provider.availability.doses.flatMap(
              (dose: string) => DOSE_NUMBERS[dose] || []
            )
          );
          // Ensure extensions numerically sorted (`DOSE_NUMBERS.*` should be).
          for (const doseNumber of DOSE_NUMBERS.all_doses) {
            if (doseNumbers.has(doseNumber)) {
              extension.push({
                url: EXTENSION_VACCINE_DOSE,
                valueInteger: doseNumber,
              });
            }
          }
        }

        return JSON.stringify({
          resourceType: "Schedule",
          id: provider.id,
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
          extension,
          meta: {
            extension: [
              {
                url: EXTENSION_LAST_SOURCE_SYNC,
                valueDateTime: (
                  provider.availability?.valid_at || provider.updated_at
                ).toISOString(),
              },
            ],
          },
        });
      })
      .join("\n")
  );
}

function formatSlotTimes(slot: SlotRecord | CapacityRecord) {
  let start: string, end: string;

  if ("start" in slot) {
    // @ts-expect-error Slot times coming from the DB are always ISO strings.
    start = slot.start;
    // FHIR slots require an end time. Scrapers don’t always get one,
    // so assume 15 minute slots when unknown.
    // @ts-expect-error Slot times coming from the DB are always ISO strings.
    end =
      slot.end ||
      DateTime.fromISO(slot.start as string, { setZone: true })
        .plus({ minutes: 15 })
        .toISO();
  } else {
    start = `${slot.date}T00:00:00Z`;
    end = `${slot.date}T00:00:00Z`;
  }

  return { start, end };
}

export async function listSlots(req: Request, res: Response): Promise<void> {
  const where: Array<string> = [];
  const values = [];
  if (req.params.state) {
    where.push(`state = ?`);
    values.push(req.params.state);
  }

  const providers = await db.listLocations({ where, values });
  res.header("Content-Type", "application/fhir+ndjson").send(
    providers
      .flatMap((provider) => {
        const slots =
          provider.availability?.slots || provider.availability?.capacity;
        if (!slots || !slots.length) return [];

        return slots.map((slot: SlotRecord | CapacityRecord) => {
          const extension: Array<any> = [];

          if (slot.available_count != null) {
            extension.push({
              url: EXTENSION_SLOT_CAPACITY,
              valueInteger: slot.available_count,
            });
          }
          if (provider.booking_phone) {
            extension.push({
              url: BOOKING_PHONE,
              valueString: provider.booking_phone,
            });
          }
          if (provider.booking_url) {
            extension.push({
              url: BOOKING_DEEP_LINK,
              valueUrl: provider.booking_url,
            });
          }

          const { start, end } = formatSlotTimes(slot);

          return JSON.stringify({
            resourceType: "Slot",
            id: `${provider.id}-${start.replace(INVALID_ID_CHARACTERS, "")}`,
            schedule: {
              reference: `Schedule/${provider.id}`,
            },
            status: slot.available === Availability.YES ? "free" : "busy",
            start,
            end,
            extension,
            meta: {
              extension: [
                {
                  url: EXTENSION_LAST_SOURCE_SYNC,
                  valueDateTime: provider.availability.valid_at.toISOString(),
                },
              ],
            },
          });
        });
      })
      .join("\n")
  );
}
