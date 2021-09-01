/**
 * Load data from CVS's SMART Scheduling Links API
 * https://github.com/smart-on-fhir/smart-scheduling-links/
 */

const got = require("got");
const Sentry = require("@sentry/node");
const { Available, LocationType } = require("../../model");
const { parseJsonLines } = require("../../utils");
const { CVS_BOOKING_URL } = require("./shared");

const CVS_SMART_API_URL =
  "https://www.cvs.com/immunizations/inventory/data/$bulk-publish";
const MANIFEST_TIMEOUT = 5 * 60 * 1000;
const HL7_SERVICE_TYPE_SYSTEM =
  "http://terminology.hl7.org/CodeSystem/service-type";
const VTRCKS_SYSTEM = "https://cdc.gov/vaccines/programs/vtrcks";
const CAPACITY_EXTENSION =
  "http://fhir-registry.smarthealthit.org/StructureDefinition/slot-capacity";
const BOOKING_DEEP_LINK_EXTENSION =
  "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-deep-link";

// Use symbols to link slots -> schedules -> locations to avoid circular
// references when serializing or logging data.
const locationReference = Symbol("schedule");
const scheduleReference = Symbol("schedule");

/**
 * Lightweight wrapper for a SMART Scheduling Links API.
 * This does some basic management around manifest caching and really basic
 * response parsing, but nothing too fancy.
 *
 * SMART SL Docs: https://github.com/smart-on-fhir/smart-scheduling-links/
 */
class SmartSchedulingLinksApi {
  constructor(url) {
    this.url = url;
    this.manifest = { time: 0, data: null };
  }

  async getManifest() {
    if (
      !this.manifest.data ||
      Date.now() - this.manifest.time > MANIFEST_TIMEOUT
    ) {
      const data = await got(this.url).json();
      this.manifest = { time: Date.now(), data };
    }
    return this.manifest.data;
  }

  async *listLocations() {
    const manifest = await this.getManifest();
    for (const item of manifest.output) {
      if (item.type === "Location") {
        const response = await got(item.url);
        for (const location of parseJsonLines(response.body)) {
          yield location;
        }
      }
    }
  }

  async *listSchedules() {
    const manifest = await this.getManifest();
    for (const item of manifest.output) {
      if (item.type === "Schedule") {
        const response = await got(item.url);
        for (const location of parseJsonLines(response.body)) {
          yield location;
        }
      }
    }
  }

  async *listSlots() {
    const manifest = await this.getManifest();
    for (const item of manifest.output) {
      if (item.type === "Slot") {
        const response = await got(item.url);
        for (const location of parseJsonLines(response.body)) {
          yield location;
        }
      }
    }
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
        coding.system === HL7_SERVICE_TYPE_SYSTEM && coding.code === "57"
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

/**
 * Get an array of UNIVAF-formatted locations & availabilities from the
 * SMART SL API.
 * @returns {Array<any>}
 */
async function getData() {
  const api = new SmartSchedulingLinksApi(CVS_SMART_API_URL);
  const manifest = await api.getManifest();
  const smartLocations = await getLocations(api);
  return Object.values(smartLocations).map((entry) =>
    formatLocation(manifest.transactionTime, entry)
  );
}

function formatLocation(validTime, locationInfo) {
  const smartLocation = locationInfo.location;
  const id = smartLocation.id.padStart(5, "0");

  const external_ids = { cvs: id };
  for (const identifier of smartLocation.identifier) {
    let system = identifier.system;
    if (identifier.system === VTRCKS_SYSTEM) {
      system = "vtrcks";
    }
    external_ids[system] = identifier.value;
  }

  let booking_phone;
  for (const entry of smartLocation.telecom) {
    if (entry.system === "phone") booking_phone = entry.value;
  }

  const position = smartLocation.position || undefined;
  if (position) {
    // FHIR geo-coordinates have an optional altitude, which we don't accept.
    delete position.altitude;
  }

  const capacity = formatCapacity(locationInfo.slots);
  let available = Available.no;
  for (const slot of capacity) {
    if (slot.available === Available.yes) {
      available = Available.yes;
      break;
    }
  }

  const checkTime = new Date().toISOString();
  return {
    id: `CVS:${id}`,
    name: `CVS #${smartLocation.id}`,
    external_ids,
    provider: "cvs",
    location_type: LocationType.pharmacy,

    address_lines: smartLocation.address.line,
    city: smartLocation.address.city,
    state: smartLocation.address.state,
    postal_code: smartLocation.address.postalCode,

    // These aren't currently available
    county: smartLocation.address.district || undefined,
    position,

    // The API includes this info, but we have a better version of the URL to
    // use instead (links you diretly into the screener instead of a confusing
    // interstitial landing page).
    booking_phone,
    booking_url: CVS_BOOKING_URL,

    availability: {
      source: "univaf-cvs-smart",
      valid_at: validTime,
      checked_at: checkTime,
      is_public: true,
      available,
      capacity,
    },
  };
}

function formatCapacity(slots) {
  const byDate = Object.create(null);
  for (const slot of slots) {
    const date = slot.start.slice(0, 10);
    let available = slot.status === "free" ? Available.yes : Available.no;
    let capacity;
    for (const extension of slot.extension) {
      if (extension.url === CAPACITY_EXTENSION) {
        // TODO: should have something that automatically parses by value type.
        capacity = parseInt(extension.valueInteger);
        if (isNaN(capacity)) {
          available = Available.unknown;
          console.error(`CVS SMART: non-integer capcity: ${extension}`);
          Sentry.captureMessage(`Unparseable slot capacity`, {
            level: Sentry.Severity.Error,
            contexts: {
              raw_slot: slot,
            },
          });
        } else if (capacity > 1) {
          // The CVS API currently returns 0 (no appointments) or 1 (*some*
          // appointments) rather than actual capacity estimates. It doesn't
          // indicate this in any way, so watch for unexpected values in case
          // something in their implementation to be more detailed.
          console.warn(`Got unexpected > 1 capacity for CVS: ${slot}`);
          Sentry.captureMessage(`Unexpected > 1 capacity for CVS`, {
            level: Sentry.Severity.Info,
            contexts: {
              raw_slot: slot,
            },
          });
        }
      } else if (extension.url === BOOKING_DEEP_LINK_EXTENSION) {
        // We don't use the Booking URL; we hardcode a better one that puts you
        // directly into the screener flow instead of an interstitial page.
        // bookingLink = extension.valueUrl;
      } else {
        console.warn(`Got unexpected slot extension for CVS: ${slot}`);
        Sentry.captureMessage(`Unexpected slot extension for CVS`, {
          level: Sentry.Severity.Info,
          contexts: {
            raw_slot: slot,
          },
        });
      }
    }

    // TODO: look at the slot's schedule to determine product/dose.
    // CVS's current implementation doesn't specify those, but a more general
    // SMART Scheduling Links client will need to support it.

    if (byDate[date]) {
      if (available === Available.yes) {
        byDate[date].available = available;
      }
    } else {
      byDate[date] = {
        date,
        available,
      };
    }
  }

  return Object.keys(byDate)
    .sort()
    .map((key) => byDate[key]);
}

async function checkAvailability(handler, options) {
  let states = [];
  if (options.cvsStates) {
    states = options.cvsStates.split(",").map((state) => state.trim());
  } else if (options.states) {
    states = options.states.split(",").map((state) => state.trim());
  }

  if (!states.length) {
    console.warn("No states specified for CVS");
    return [];
  }

  let stores = await getData();
  stores = stores.filter((store) => states.includes(store.state));
  stores.forEach((store) => handler(store));
  return stores;
}

module.exports = {
  checkAvailability,
  CVS_SMART_API_URL,
};
