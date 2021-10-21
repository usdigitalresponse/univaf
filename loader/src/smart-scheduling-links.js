/**
 * Tools for loading data from SMART Scheduling Links APIs.
 * https://github.com/smart-on-fhir/smart-scheduling-links/
 */

const { httpClient, parseJsonLines } = require("./utils");

const MANIFEST_CACHE_TIME = 5 * 60 * 1000;

/** Identifiers for types of records, extensions, etc. in FHIR and SMART SL. */
const SYSTEMS = Object.freeze({
  HL7_SERVICE_TYPE: "http://terminology.hl7.org/CodeSystem/service-type",
  /** CDC VTrckS PIN */
  VTRCKS: "https://cdc.gov/vaccines/programs/vtrcks",
  /** National Privider ID from United States DHHS */
  NPI_USA: "http://hl7.org/fhir/sid/us-npi",
});

/** Identifiers for types of extension objects in FHIR and SMART SL. */
const EXTENSIONS = Object.freeze({
  CAPACITY:
    "http://fhir-registry.smarthealthit.org/StructureDefinition/slot-capacity",
  BOOKING_DEEP_LINK:
    "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-deep-link",
  BOOKING_PHONE:
    "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-phone",
  PRODUCT:
    "http://fhir-registry.smarthealthit.org/StructureDefinition/vaccine-product",
  DOSE: "http://fhir-registry.smarthealthit.org/StructureDefinition/vaccine-dose",
});

/** Maps CVX codes (standardized vaccine identifiers) to our product IDs. */
const PRODUCTS_BY_CVX_CODE = {
  210: "astra_zeneca",
  207: "moderna",
  211: "novavax",
  208: "pfizer",
  212: "jj",
};

// Use symbols to link slots -> schedules -> locations to avoid circular
// references when serializing or logging data.
const locationReference = Symbol("location");
const scheduleReference = Symbol("schedule");
// Link information about an item's source from the manifest file (e.g. a
// Slot object will use this to reference the manifest item the slot was from).
const sourceReference = Symbol("source");

/**
 * Lightweight wrapper for a SMART Scheduling Links API.
 * This does some basic management around manifest caching and really basic
 * response parsing, but nothing too fancy.
 *
 * SMART SL Docs: https://github.com/smart-on-fhir/smart-scheduling-links/
 */
class SmartSchedulingLinksApi {
  /**
   * Create a SMART SL API instance.
   * @param {string} url URL a SMART SL's manifest (ending with "$bulk-publish")
   * @param {any} [httpOptions] Additional options to use when making an HTTP
   *        request, e.g. headers.
   */
  constructor(url, httpOptions) {
    this.url = url;
    this.httpOptions = httpOptions;
    this.manifest = { time: 0, data: null };
  }

  async getManifest() {
    if (
      !this.manifest.data ||
      Date.now() - this.manifest.time > MANIFEST_CACHE_TIME
    ) {
      const data = await httpClient({
        ...this.httpOptions,
        url: this.url,
      }).json();
      this.manifest = { time: Date.now(), data };
    }
    return this.manifest.data;
  }

  async *listItems(type, states) {
    const manifest = await this.getManifest();
    for (const item of manifest.output) {
      if (item.type === type) {
        const mayMatchState =
          !states ||
          !item.extension?.state ||
          states.some((state) => item.extension.state.includes(state));
        if (mayMatchState) {
          const response = await httpClient({
            ...this.httpOptions,
            url: item.url,
          });
          for (const record of parseJsonLines(response.body)) {
            record[sourceReference] = item;
            yield record;
          }
        }
      }
    }
  }

  async *listLocations(states) {
    yield* this.listItems("Location", states);
  }

  async *listSchedules(states) {
    yield* this.listItems("Schedule", states);
  }

  async *listSlots(states) {
    yield* this.listItems("Slot", states);
  }
}

/**
 * Determine whether a SMART SL `Schedule` object represents COVID-19
 * vaccinations.
 * @param {any} schedule
 * @returns {boolean}
 */
function isCovidSchedule(schedule) {
  return schedule.serviceType.some((service) =>
    service.coding.some(
      (coding) =>
        coding.system === SYSTEMS.HL7_SERVICE_TYPE && coding.code === "57"
    )
  );
}

/**
 * Get a list of objects representing the locations available in a SMART SL API
 * along with their associaated schedules and slots.
 * @param {SmartSchedulingLinksApi} api
 * @param {Array<string>} [states] List of state abbreviations. If set, only
 *        return data for locations possibly in the given states. Note this can
 *        still return additional locations if an API endpoint does not provide
 *        state information for some resources.
 * @returns {Array<{location: any, schedules: Array<any>, slots: Array<any>}>}
 */
async function getLocations(api, states) {
  const locations = Object.create(null);
  for await (const location of api.listLocations(states)) {
    locations[location.id] = { location, schedules: [], slots: [] };
  }

  const schedules = Object.create(null);
  for await (const schedule of api.listSchedules(states)) {
    schedules[schedule.id] = schedule;
    if (isCovidSchedule(schedule)) {
      // FIXME: This assumes the first actor is the location, which is not safe.
      const locationId = schedule.actor[0].reference.split("/")[1];
      const location = locations[locationId];
      if (location) {
        location.schedules.push(schedule);
        schedule[locationReference] = location;
      } else {
        console.error(`Found schedule with unknown location: ${schedule.id}`);
      }
    } else {
      console.warn(
        `Found non-COVID schedule: ${JSON.stringify(schedule.serviceType)}`
      );
    }
  }

  for await (const slot of api.listSlots(states)) {
    const scheduleId = slot.schedule.reference.split("/")[1];
    const schedule = schedules[scheduleId];
    if (schedule) {
      slot[scheduleReference] = schedule;
      schedule[locationReference].slots.push(slot);
    } else {
      console.error(
        `No schedule ${scheduleId} (referenced from slot ${slot.id})`,
        slot[sourceReference]
      );
    }
  }

  // The SMART SL manifest file may specify relevant states only on some
  // endpoints, so we could still receive locations from outside the requested
  // states and need to do extra filtering here.
  if (!states) {
    return locations;
  } else {
    return Object.fromEntries(
      Object.entries(locations).filter(
        ([_id, data]) =>
          !data.location.address.state ||
          states.includes(data.location.address.state)
      )
    );
  }
}
    }
  }

  return locations;
}

module.exports = {
  SYSTEMS,
  EXTENSIONS,
  PRODUCTS_BY_CVX_CODE,
  SmartSchedulingLinksApi,
  getLocations,
  isCovidSchedule,
  locationReference,
  scheduleReference,
  sourceReference,
};
