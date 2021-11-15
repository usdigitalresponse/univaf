/**
 * Load data from PrepMod's SMART Scheduling Links API
 * https://github.com/smart-on-fhir/smart-scheduling-links/
 *
 * PrepMod maintains separate deployments for each customer, so we have to
 * contact at least one (and sometimes several) hosts in each state.
 */

const Sentry = require("@sentry/node");
const {
  EXTENSIONS,
  PRODUCTS_BY_CVX_CODE,
  SmartSchedulingLinksApi,
  getLocations,
  scheduleReference,
  formatExternalIds,
  valuesAsObject,
} = require("../../smart-scheduling-links");
const { Available, LocationType } = require("../../model");
const { prepmodHostsByState } = require("./hosts");
const { HTTPError } = require("got");
const { matchVaccineProduct } = require("../../utils");

const API_PATH = "/api/smart-scheduling-links/$bulk-publish";

function warn(message, context) {
  console.warn(`PrepMod: ${message}`, context);
  // Sentry does better fingerprinting with an actual exception object.
  if (message instanceof Error) {
    Sentry.captureException(message, { level: Sentry.Severity.Info });
  } else {
    Sentry.captureMessage(message, Sentry.Severity.Info);
  }
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
  const idPrefix = `prepmod-${cleanHost}`;

  const external_ids = formatExternalIds(smartLocation, {
    smartIdName: `${idPrefix}-location`,
    formatUnknownId({ system, value }) {
      if (/^urn:.*:prepmod:clinic$/.test(system)) {
        return [`${idPrefix}-clinic`, value];
      }
      return [system, value];
    },
  });

  const { phone: info_phone, url: info_url } = valuesAsObject(
    smartLocation.telecom
  );

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
      if (extension.url === EXTENSIONS.CAPACITY) {
        // TODO: should have something that automatically parses by value type.
        capacity = parseInt(extension.valueInteger);
        if (isNaN(capacity)) {
          warn(`Non-integer capacity: ${JSON.stringify(extension)}`, {
            slotId: smartSlot.id,
          });
        }
      } else if (extension.url === EXTENSIONS.BOOKING_DEEP_LINK) {
        booking_url = extension.valueUrl;
      } else {
        warn(`Unknown slot extension url: ${JSON.stringify(extension)}`, {
          slotId: smartSlot.id,
        });
      }
    }

    const products = new Set();
    const doses = new Set();
    const schedule = smartSlot[scheduleReference];
    if (schedule) {
      for (const extension of schedule.extension) {
        if (extension.url === EXTENSIONS.PRODUCT) {
          let product;
          if (extension.valueCoding.code) {
            product = PRODUCTS_BY_CVX_CODE[extension.valueCoding.code];
          } else {
            product = matchVaccineProduct(extension.valueCoding.display);
          }
          if (product) {
            products.add(product);
          } else if (!/^influenza|flu/i.test(extension.valueCoding.display)) {
            warn(`Unparseable product extension: ${JSON.stringify(extension)}`);
          }
        } else if (extension.url === EXTENSIONS.DOSE) {
          if (extension.valueInteger >= 1 && extension.valueInteger <= 2) {
            doses.add(extension.valueInteger);
          } else {
            warn(`Unparseable dose extension: ${JSON.stringify(extension)}`);
          }
        } else {
          warn(`Unknown schedule extension url: ${JSON.stringify(extension)}`);
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
  API_PATH,
  checkAvailability,
  formatLocation,
};
