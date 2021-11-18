/**
 * Load data from PrepMod's SMART Scheduling Links API
 * https://github.com/smart-on-fhir/smart-scheduling-links/
 *
 * PrepMod maintains separate deployments for each customer, so we have to
 * contact at least one (and sometimes several) hosts in each state.
 */

const Sentry = require("@sentry/node");
const { ApiClient } = require("../../api-client");
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

async function getKnownLocations(state) {
  const client = ApiClient.fromEnv();
  const locations = await client.getLocations({
    state,
    provider: "prepmod",
  });

  // Create a lookup object indexed by external ID.
  const result = Object.create(null);
  for (const location of locations) {
    // Drop `availability` so we don't wind up sending out-of-date info back.
    // TODO: remove after doing https://github.com/usdigitalresponse/univaf/issues/201
    delete location.availability;
    const data = { location, found: false };
    for (const externalId of location.external_ids) {
      result[externalId.join(":")] = data;
    }
  }
  return result;
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
    is_public: true,
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

    booking_url: formatLocationBookingUrl(host, smartLocation),
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

/**
 * Get a URL to use as a location's booking URL.
 *
 * Because a location represents many clinics, we can't provide a booking URL
 * that takes you straight to picking a time slot. Instead, we link to a
 * targeted search that gives you a narrower list of places to pick from. There
 * are some downsides here, though: the search may include *other* locations,
 * since it doesn't give us the parameters we need for more speicific results.
 *
 * @param {string} host PrepMod host URL, e.g. "https://myhealth.alaska.gov"
 * @param {Object} location A SMART SL location object.
 * @returns {string}
 */
function formatLocationBookingUrl(host, location) {
  // Possible querysting parameters include:
  //   "search_radius" (a string like "25 miles")
  //   "location" (a zip code)
  //   "q[venue_search_name_or_venue_name_i_cont]" (name of a venue)
  //   "clinic_date_eq[month]" (month of event)
  //   "clinic_date_eq[day]" (day of event)
  //   "clinic_date_eq[year]" (year of event)
  //   "q[vaccinations_name_i_cont]" (friendly name of vaccine, e.g.
  //       "Moderna COVID-19 Vaccine". This will differ by host.)
  const bookingUrlData = new URL(`${host}/appointment/en/clinic/search`);
  bookingUrlData.searchParams.set("location", location.address.postalCode);
  // Sadly, the search is always relative to the centroid of the zip code, and
  // may actually exclude some locations in the requested zip code! 10 miles
  // is our happy medium: it should *usually* cover the entire zip code. It's
  // not perfect, and will sometimes be too small, but often be too large.
  bookingUrlData.searchParams.set("search_radius", "10 miles");
  bookingUrlData.searchParams.set(
    "q[venue_search_name_or_venue_name_i_cont]",
    location.name
  );
  return bookingUrlData.href;
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
      // Load known locations in the state so we can mark any that are missing
      // from PrepMod as private. (It's not unusual for locations to be public
      // and later become private, at which point we should hide them, too.)
      const knownLocations = options.hideMissingLocations
        ? await getKnownLocations(state)
        : Object.create(null);

      for (const host of Object.values(namedHosts)) {
        try {
          const hostLocations = await getDataForHost(host);
          hostLocations.forEach((location) => {
            handler(location, { update_location: true });

            // If we already knew about this location, mark it as found.
            for (const externalId of location.external_ids) {
              const known = knownLocations[externalId.join(":")];
              if (known) {
                known.found = true;
                break;
              }
            }
          });
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

      for (const known of new Set([...Object.values(knownLocations)])) {
        if (!known.found) {
          const newData = { ...known.location, is_public: false };
          results.push(newData);
          handler(newData, { update_location: true });
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
