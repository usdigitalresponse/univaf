/**
 * Load data from PrepMod's SMART Scheduling Links API
 * https://github.com/smart-on-fhir/smart-scheduling-links/
 *
 * PrepMod maintains separate deployments for each customer, so we have to
 * contact at least one (and sometimes several) hosts in each state.
 */

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
const { matchVaccineProduct, createWarningLogger } = require("../../utils");

const API_PATH = "/api/smart-scheduling-links/$bulk-publish";

const warn = createWarningLogger("prepmod");

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
  return Object.values(smartLocations)
    .map((entry) => formatLocation(host, manifest.transactionTime, entry))
    .filter(Boolean);
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
  // PrepMod pretty much lists all schedules as COVID schedules since their
  // system for modeling vaccines is pretty loose. This helps us skip over
  // locations that don't actually appear to be for COVID vaccines at all.
  const isCovidLocation = locationInfo.schedules.some(
    (schedule) => parseSchedule(schedule).isCovid
  );
  if (!isCovidLocation) {
    return null;
  }

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

// PrepMod is used lots of public health clinics that provide other, non-COVID
// services. This pattern matches non-COVID-vaccines that we expect to find so
// we know they aren't an error.
// - Flu/Influenza vaccines
// - Zoster (shingles) vaccines
// - Adenovirus vaccines (This one has a narrower definition to make sure we
//   are only matching vaccines against adenovirus, not ones that might be using
//   modified adenovirus as a vaccine against COVID or other things.)
const raw = String.raw;
const nonCovidProductName = new RegExp(
  [
    raw`^influenza`,
    raw`flu`,
    raw`zoster`,
    raw`^\s*adenovirus\s*$`,
    raw`^child and adolescent immunization`,
  ].join("|"),
  "i"
);

/**
 * Parse useful data about a schedule.
 * @param {Object} schedule A SMART SL schedule object to parse
 * @returns {{isCovid: boolean, hasNonCovidProducts: boolean, products: Set<string>, dose: string}}
 */
function parseSchedule(schedule) {
  const doses = new Set();
  const data = {
    isCovid: true,
    hasNonCovidProducts: false,
    products: new Set(),
    dose: undefined,
  };

  if (!schedule) return data;

  for (const extension of schedule.extension) {
    if (extension.url === EXTENSIONS.PRODUCT) {
      let product;
      if (extension.valueCoding.code) {
        product = PRODUCTS_BY_CVX_CODE[extension.valueCoding.code];
      } else {
        product = matchVaccineProduct(extension.valueCoding.display);
      }

      if (product) {
        data.products.add(product);
      } else if (nonCovidProductName.test(extension.valueCoding.display)) {
        data.hasNonCovidProducts = true;
      } else {
        warn(
          "Unparseable product extension",
          {
            scheduleId: schedule.id,
            extension,
          },
          true
        );
      }
    } else if (extension.url === EXTENSIONS.DOSE) {
      if (extension.valueInteger >= 1 && extension.valueInteger <= 2) {
        doses.add(extension.valueInteger);
      } else {
        warn(
          "Unparseable dose extension",
          {
            scheduleId: schedule.id,
            extension,
          },
          true
        );
      }
    } else {
      warn(
        `Unknown schedule extension url: "${extension.url}"`,
        {
          scheduleId: schedule.id,
          extension,
        },
        true
      );
    }
  }

  if (doses.size > 1) {
    data.dose = "all_doses";
  } else if (doses.has(1)) {
    data.dose = "first_dose_only";
  } else if (doses.has(2)) {
    data.dose = "second_dose_only";
  }

  // The PrepMod API includes non-COVID products on COVID schedules. If a
  // slot/schedule *only* has non-COVID products, then treat it as the non-COVID
  // schedule it really is.
  if (data.products.size === 0 && data.hasNonCovidProducts) {
    data.isCovid = false;
  }

  return data;
}

function formatSlots(smartSlots) {
  let available = Available.no;
  const slots = smartSlots
    .map((smartSlot) => {
      const { isCovid, products, dose } = parseSchedule(
        smartSlot[scheduleReference]
      );
      if (!isCovid) {
        return null;
      }

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
            warn(
              `Non-integer slot capacity`,
              {
                slotId: smartSlot.id,
                extension,
              },
              true
            );
          }
        } else if (extension.url === EXTENSIONS.BOOKING_DEEP_LINK) {
          booking_url = extension.valueUrl;
        } else {
          warn(
            `Unknown slot extension url: "${extension.url}"`,
            {
              slotId: smartSlot.id,
              extension,
            },
            true
          );
        }
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
    })
    .filter(Boolean);

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
