/**
 * Load data from CVS's SMART Scheduling Links API
 * https://github.com/smart-on-fhir/smart-scheduling-links/
 */

const { Available, LocationType } = require("../../model");
const {
  EXTENSIONS,
  SmartSchedulingLinksApi,
  getLocations,
  formatExternalIds,
  valuesAsObject,
} = require("../../smart-scheduling-links");
const { createWarningLogger, DEFAULT_STATES } = require("../../utils");
const { CVS_BOOKING_URL } = require("./shared");

const CVS_SMART_API_URL =
  "https://www.cvs.com/immunizations/inventory/data/$bulk-publish";

const warn = createWarningLogger("cvsSmart");
const logError = createWarningLogger("cvsSmart", "error");

/**
 * Get an array of UNIVAF-formatted locations & availabilities from the
 * SMART SL API.
 * @returns {Promise<Array<any>>}
 */
async function getData(states) {
  const api = new SmartSchedulingLinksApi(CVS_SMART_API_URL);
  const manifest = await api.getManifest();
  const smartLocations = await getLocations(api, states);
  return Object.values(smartLocations).map((entry) =>
    formatLocation(manifest.transactionTime, entry)
  );
}

function formatLocation(validTime, locationInfo) {
  const smartLocation = locationInfo.location;

  const external_ids = formatExternalIds(smartLocation, {
    smartIdName: "cvs",
  });

  const booking_phone = valuesAsObject(smartLocation.telecom).phone;

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
      if (extension.url === EXTENSIONS.CAPACITY) {
        // TODO: should have something that automatically parses by value type.
        capacity = parseInt(extension.valueInteger);
        if (isNaN(capacity)) {
          available = Available.unknown;
          logError("Non-integer slot capcity", slot, true);
        } else if (capacity > 1) {
          // The CVS API currently returns 0 (no appointments) or 1 (*some*
          // appointments) rather than actual capacity estimates. It doesn't
          // indicate this in any way, so watch for unexpected values in case
          // something in their implementation to be more detailed.
          warn("Unexpected > 1 capacity for slot", { slot }, true);
        }
      } else if (extension.url === EXTENSIONS.BOOKING_DEEP_LINK) {
        // We don't use the Booking URL; we hardcode a better one that puts you
        // directly into the screener flow instead of an interstitial page.
        // bookingLink = extension.valueUrl;
      } else {
        warn("Unexpected slot extension", { slot }, true);
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

async function checkAvailability(handler, { states = DEFAULT_STATES }) {
  const stores = await getData(states);
  stores.forEach((store) => handler(store));
  return stores;
}

module.exports = {
  checkAvailability,
  CVS_SMART_API_URL,
};
