/**
 * Load data from PrepMod's SMART Scheduling Links API
 * https://github.com/smart-on-fhir/smart-scheduling-links/
 *
 * PrepMod maintains separate deployments for each customer, so we have to
 * contact at least one (and sometimes several) hosts in each state.
 */

const Sentry = require("@sentry/node");
const { Available, LocationType } = require("../../model");
const { httpClient, parseJsonLines } = require("../../utils");
const { prepmodHostsByState } = require("./hosts");
const { HTTPError } = require("got");

const API_PATH = "/api/smart-scheduling-links/$bulk-publish";
const MANIFEST_TIMEOUT = 5 * 60 * 1000;
const HL7_SERVICE_TYPE_SYSTEM =
  "http://terminology.hl7.org/CodeSystem/service-type";
const VTRCKS_SYSTEM = "https://cdc.gov/vaccines/programs/vtrcks";
const CAPACITY_EXTENSION =
  "http://fhir-registry.smarthealthit.org/StructureDefinition/slot-capacity";
const BOOKING_DEEP_LINK_EXTENSION =
  "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-deep-link";
const PRODUCT_EXTENSION =
  "http://fhir-registry.smarthealthit.org/StructureDefinition/vaccine-product";
const DOSE_EXTENSION =
  "http://fhir-registry.smarthealthit.org/StructureDefinition/vaccine-dose";

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
  constructor(url) {
    this.url = url;
    this.manifest = { time: 0, data: null };
  }

  async getManifest() {
    if (
      !this.manifest.data ||
      Date.now() - this.manifest.time > MANIFEST_TIMEOUT
    ) {
      const data = await httpClient(this.url).json();
      this.manifest = { time: Date.now(), data };
    }
    return this.manifest.data;
  }

  async *listItems(type) {
    const manifest = await this.getManifest();
    for (const item of manifest.output) {
      if (item.type === type) {
        const response = await httpClient(item.url);
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

function getApiForHost(host) {
  return new SmartSchedulingLinksApi(`${host}${API_PATH}`);
}

/**
 * Get an array of UNIVAF-formatted locations & availabilities from the
 * SMART SL API.
 * @returns {Array<any>}
 */
async function getDataForHost(host) {
  const api = getApiForHost(host);
  const manifest = await api.getManifest();
  const smartLocations = await getLocations(api);
  return Object.values(smartLocations).map((entry) =>
    formatLocation(host, manifest.transactionTime, entry)
  );
}

function formatLocation(host, validTime, locationInfo) {
  const smartLocation = locationInfo.location;

  const cleanHost = host.replace(/^https?:\/\//, "").toLowerCase();
  const idSystem = `prepmod-${cleanHost}-location`;

  const external_ids = [[idSystem, smartLocation.id]];
  for (const identifier of smartLocation.identifier) {
    let system = identifier.system;
    if (system === VTRCKS_SYSTEM) {
      system = "vtrcks";
    } else if (/^urn:.*:prepmod:clinic$/.test(system)) {
      system = `prepmod-${cleanHost}-clinic`;
    }
    external_ids.push([system, identifier.value]);
  }

  let info_phone;
  let info_url;
  for (const entry of smartLocation.telecom) {
    if (entry.system === "phone") info_phone = entry.value;
    else if (entry.system === "url") info_url = entry.value;
  }

  const position = smartLocation.position || undefined;
  if (position) {
    // FHIR geo-coordinates have an optional altitude, which we don't accept.
    delete position.altitude;
  }

  const { available, slots } = formatSlots(locationInfo.slots);

  const checkTime = new Date().toISOString();
  return {
    name: smartLocation.name,
    external_ids,
    provider: "prepmod",
    location_type: LocationType.clinic,

    address_lines: smartLocation.address.line,
    city: smartLocation.address.city,
    state: smartLocation.address.state,
    postal_code: smartLocation.address.postalCode,
    county: smartLocation.address.district || undefined,
    position,

    info_url,
    info_phone,

    availability: {
      source: "univaf-prepmod",
      valid_at: validTime,
      checked_at: checkTime,
      is_public: true,
      available,
      slots,
    },
  };
}

function formatSlots(smartSlots) {
  let available = Available.no;
  const slots = smartSlots.map((smartSlot) => {
    const slotAvailable =
      smartSlot.status === "free" ? Available.yes : Available.no;
    if (available === Available.no) {
      available = slotAvailable;
    }

    let capacity = 1;
    let booking_url;
    for (const extension of smartSlot.extension) {
      if (extension.url === CAPACITY_EXTENSION) {
        // TODO: should have something that automatically parses by value type.
        capacity = parseInt(extension.valueInteger);
        if (isNaN(capacity)) {
          console.error(
            `PrepMod: non-integer capcity: ${JSON.stringify(extension)}`
          );
          Sentry.captureMessage(`Unparseable slot capacity`, {
            level: Sentry.Severity.Error,
            contexts: {
              raw_slot: smartSlot,
            },
          });
        }
      } else if (extension.url === BOOKING_DEEP_LINK_EXTENSION) {
        booking_url = extension.valueUrl;
      } else {
        console.warn(
          `Got unexpected slot slot url for PrepMod: ${JSON.stringify(
            extension
          )}`
        );
        Sentry.captureMessage(`Unexpected slot extension url for PrepMod`, {
          level: Sentry.Severity.Info,
          contexts: {
            raw_slot: smartSlot,
          },
        });
      }
    }

    const products = new Set();
    const doses = new Set();
    const schedule = smartSlot[scheduleReference];
    if (schedule) {
      for (const extension of schedule.extension) {
        if (extension.url === PRODUCT_EXTENSION) {
          let product;
          if (extension.valueCoding.code) {
            product = PRODUCTS_BY_CVX_CODE[extension.valueCoding.code];
          } else {
            const name = extension.valueCoding.display.toLowerCase();
            if (/astra\s*zeneca/.test(name)) {
              product = "astra_zeneca";
            } else if (name.includes("moderna")) {
              product = "moderna";
            } else if (/nova\s*vax/.test(name)) {
              product = "novavax";
            } else if (name.includes("pfizer")) {
              product = "pfizer";
            } else if (/janssen|johnson/.test(name)) {
              product = "jj";
            }
          }
          if (product) {
            products.add(product);
          } else {
            console.warn(
              `Got unparseable product extension for PrepMod: ${JSON.stringify(
                extension
              )}`
            );
          }
        } else if (extension.url === DOSE_EXTENSION) {
          if (extension.valueInteger >= 1 && extension.valueInteger <= 2) {
            doses.add(extension.valueInteger);
          } else {
            console.warn(
              `Got unknown dose extension value for PrepMod: ${JSON.stringify(
                extension
              )}`
            );
          }
        } else {
          console.warn(
            `Got unexpected schedule extension url for PrepMod: ${JSON.stringify(
              extension
            )}`
          );
          Sentry.captureMessage(
            `Unexpected schdule extension url for PrepMod`,
            {
              level: Sentry.Severity.Info,
              contexts: {
                raw_slot: smartSlot,
              },
            }
          );
        }
      }
    }

    let dose;
    if (doses.size > 1) {
      dose = "all_doses";
    } else if (doses.has(1)) {
      dose = "first_dose_only";
    } else if (doses.has(2)) {
      dose = "second_dose_only";
    }

    return {
      start: smartSlot.start,
      end: smartSlot.end,
      available: slotAvailable,
      available_count: capacity > 1 ? capacity : undefined,
      products: products.size > 0 ? Array.from(products) : undefined,
      dose: dose,
      booking_url,
    };
  });

  return { available, slots };
}

async function checkAvailability(handler, options) {
  let states = [];
  if (options.prepmodStates) {
    states = options.prepmodStates.split(",").map((state) => state.trim());
  } else if (options.states) {
    states = options.states.split(",").map((state) => state.trim());
  }

  if (!states.length) {
    console.warn("No states specified for PrepMod");
    return [];
  }

  let results = [];
  for (const [state, namedHosts] of Object.entries(prepmodHostsByState)) {
    if (states.includes(state)) {
      for (const host of Object.values(namedHosts)) {
        try {
          const hostLocations = await getDataForHost(host);
          hostLocations.forEach((location) => handler(location));
          results = results.concat(hostLocations);
        } catch (error) {
          // FIXME: this should be a custom error emitted by the
          // SmartSchedulingLinksApi class.
          if (error instanceof HTTPError && error.response.statusCode === 404) {
            console.error(`PrepMod API not enabled for ${host}`);
          } else {
            throw error;
          }
        }
      }
    }
  }

  return results;
}

module.exports = {
  checkAvailability,
  API_PATH,
};
