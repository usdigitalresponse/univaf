/**
 * Load data from Kroger's SMART Scheduling Links API
 * https://github.com/smart-on-fhir/smart-scheduling-links/
 */

const Sentry = require("@sentry/node");
const { Available, LocationType } = require("../model");
const {
  EXTENSIONS,
  SmartSchedulingLinksApi,
  getLocations,
  formatExternalIds,
  valuesAsObject,
  getExtensions,
} = require("../smart-scheduling-links");

const API_URL =
  "https://api.kroger.com/v1/health-wellness/schedules/vaccines/$bulk-publish";

/**
 * Get an array of UNIVAF-formatted locations & availabilities from the
 * SMART SL API.
 * @returns {Array<any>}
 */
async function getData(states) {
  const api = new SmartSchedulingLinksApi(API_URL);
  const manifest = await api.getManifest();
  const smartLocations = await getLocations(api, states);
  return Object.values(smartLocations).map((entry) =>
    formatLocation(manifest.transactionTime, entry)
  );
}

function formatLocation(validTime, locationInfo) {
  const smartLocation = locationInfo.location;

  // ID systems:
  // Harris Teeter: kroger_hart
  // City Market Pharmacy: kroger_citymarket
  //     ^ These have IDs starting with 625..., but we already have these same
  //       locations with IDs starting with 620...!
  // Copps Pharmacy: ~kroger_metro_market~ HMMMMMMM! Overloaded with actual Metro Market :(
  // Dillons Pharmacy: kroger, kroger_dillons, kroger_payless (Seems like the pharmacy inside most Pay-Less Markets is Dillons)
  // Fred Meyer Pharmacy: kroger_fred
  // Frys Pharmacy: kroger_frys, kroger_covid
  // Gerbes Pharmacy: kroger_gerbes
  // JayC Pharmacy: kroger_jayc
  // King Soopers Pharmacy: kroger_kingsoopers
  // Kroger Pharmacy: kroger
  // Mariano's Pharmacy: kroger_marianos
  // Metro Market Pharmacy: kroger_metro_market
  // Pick 'n Save Pharmacy: kroger_pick_n_save
  // QFC Pharmacy: kroger_qfc
  // Ralphs Pharmacy: kroger_ralphs
  // Smith's Pharmacy: kroger_smiths
  // The Little Clinic: kroger_the_little_clinic

  // XXX: we need to gin up the correct brand-based external ID names we've
  // been using in the past from vaccinespotter.
  // XXX: make sure we are removing zero-padding appropriately.
  const external_ids = formatExternalIds(smartLocation, {
    smartIdName: "kroger",
  });

  const { phone: info_phone, url: info_url } = valuesAsObject(
    smartLocation.telecom
  );
  // XXX: verify that all slots share identical booking URLs
  const slotExtensions = getExtensions(locationInfo.slots?.[0]);
  const booking_url = slotExtensions[EXTENSIONS.BOOKING_DEEP_LINK];

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
    name: smartLocation.name,
    external_ids,
    provider: "kroger",
    location_type: LocationType.pharmacy,

    address_lines: smartLocation.address.line,
    city: smartLocation.address.city,
    state: smartLocation.address.state,
    postal_code: smartLocation.address.postalCode,

    // These aren't currently available
    county: smartLocation.address.district || undefined,
    position,

    info_phone,
    info_url,
    booking_url,

    availability: {
      source: "univaf-kroger-smart",
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
      if (extension.url === EXTENSIONS.CAPACITY) {
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
      } else if (extension.url === EXTENSIONS.BOOKING_DEEP_LINK) {
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
  if (options.krogerStates) {
    states = options.krogerStates.split(",").map((state) => state.trim());
  } else if (options.states) {
    states = options.states.split(",").map((state) => state.trim());
  }

  if (!states.length) {
    console.warn("No states specified for Kroger");
    return [];
  }

  const stores = await getData(states);
  stores.forEach((store) => handler(store));
  return stores;
}

module.exports = {
  checkAvailability,
  API_URL,
};
