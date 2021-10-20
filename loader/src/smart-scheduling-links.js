/**
 * Tools for loading data from SMART Scheduling Links APIs.
 * https://github.com/smart-on-fhir/smart-scheduling-links/
 */

const { httpClient, parseJsonLines } = require("./utils");

const MANIFEST_CACHE_TIME = 5 * 60 * 1000;

/** Identifiers for types of records, extensions, etc. in FHIR and SMART SL. */
const SYSTEMS = Object.freeze({
  HL7_SERVICE_TYPE: "http://terminology.hl7.org/CodeSystem/service-type",
  VTRCKS: "https://cdc.gov/vaccines/programs/vtrcks",
});

/** Identifiers for types of extension objects in FHIR and SMART SL. */
const EXTENSIONS = Object.freeze({
  CAPACITY:
    "http://fhir-registry.smarthealthit.org/StructureDefinition/slot-capacity",
  BOOKING_DEEP_LINK:
    "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-deep-link",
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

  async *listItems(type) {
    const manifest = await this.getManifest();
    for (const item of manifest.output) {
      if (item.type === type) {
        const response = await httpClient({
          ...this.httpOptions,
          url: item.url,
        });
        for (const location of parseJsonLines(response.body)) {
          yield location;
        }
      }
    }
  }

  async *listLocations() {
    yield* this.listItems("Location");
  }

  async *listSchedules() {
    yield* this.listItems("Schedule");
  }

  async *listSlots() {
    yield* this.listItems("Slot");
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
 * @returns {Array<{location: any, schedules: Array<any>, slots: Array<any>}>}
 */
async function getLocations(api) {
  const locations = Object.create(null);
  for await (const location of api.listLocations()) {
    locations[location.id] = { location, schedules: [], slots: [] };
  }

  const schedules = Object.create(null);
  for await (const schedule of api.listSchedules()) {
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

  for await (const slot of api.listSlots()) {
    const scheduleId = slot.schedule.reference.split("/")[1];
    const schedule = schedules[scheduleId];
    if (schedule) {
      slot[scheduleReference] = schedule;
      schedule[locationReference].slots.push(slot);
    } else {
      console.error(`No schedule for slot ${slot.id}`);
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
};
