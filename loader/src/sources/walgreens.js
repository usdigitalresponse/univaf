/**
 * Load data from Walgreens's SMART Scheduling Links API
 * https://github.com/jmandel/wba-appointment-fetch
 * (Despite the description in the README, this is in fact confirmed by
 * Walgreens to be their official implementation.)
 */

const Sentry = require("@sentry/node");
const { Available, LocationType } = require("../model");
const { titleCase } = require("../utils");
const {
  EXTENSIONS,
  SmartSchedulingLinksApi,
  getLocations,
  getExtensions,
  valuesAsObject,
  sourceReference,
  formatExternalIds,
} = require("../smart-scheduling-links");

const API_URL =
  "https://wbaschedulinglinks.blob.core.windows.net/fhir/$bulk-publish";

// System used for Walgreens store IDs.
const WALGREENS_ID_SYSTEM = "https://walgreens.com";

/**
 * Get an array of UNIVAF-formatted locations & availabilities from the
 * SMART SL API.
 * @returns {Array<any>}
 */
async function getData(states) {
  const api = new SmartSchedulingLinksApi(API_URL);
  const smartLocations = await getLocations(api, states);
  return Object.values(smartLocations).map((entry) => formatLocation(entry));
}

function formatLocation(locationInfo) {
  const smartLocation = locationInfo.location;

  const external_ids = formatExternalIds(smartLocation, {
    smartIdName: "walgreens_smart",
    formatUnknownId({ system, value }) {
      if (system === WALGREENS_ID_SYSTEM) {
        // Get rid of any zero-padding
        const id = parseInt(value, 10) || value;
        return ["walgreens", id.toString()];
      }
      return [system, value];
    },
  });

  // All Walgreens slots for a location share an identical booking URL/phone,
  // so just grab one from the first slot in a location.
  const slotExtensions = getExtensions(locationInfo.slots?.[0]);
  const booking_phone = slotExtensions[EXTENSIONS.BOOKING_PHONE];
  const booking_url = slotExtensions[EXTENSIONS.BOOKING_DEEP_LINK];
  const { phone: info_phone, url: info_url } = valuesAsObject(
    smartLocation.telecom
  );

  const position = smartLocation.position || undefined;
  if (position) {
    // FHIR geo-coordinates have an optional altitude, which we don't accept.
    delete position.altitude;
  }

  const capacity = formatCapacity(locationInfo.slots);
  const available = locationInfo.slots?.some((slot) => slot.status === "free")
    ? Available.yes
    : Available.no;

  // Walgreens carries freshness times in the manifest as a `currentAsOf`
  // extension on Slot files, rather than the recommended `lastSourceSync`
  // extension on individual records in those files.
  const checkTime = new Date().toISOString();
  const validTime =
    locationInfo.slots?.[0]?.[sourceReference]?.extension?.currentAsOf ||
    checkTime;

  return {
    name: smartLocation.name,
    external_ids,
    provider: "walgreens",
    location_type: LocationType.pharmacy,

    address_lines: smartLocation.address.line,
    city: smartLocation.address.city,
    state: smartLocation.address.state,
    postal_code: smartLocation.address.postalCode,
    county: titleCase(smartLocation.address.district),
    position,

    info_phone,
    info_url,
    booking_phone,
    booking_url,

    availability: {
      source: "univaf-walgreens-smart",
      valid_at: validTime,
      checked_at: checkTime,
      is_public: true,
      available,
      capacity: capacity || undefined,
    },
  };
}

// TODO: unify this with similar code for CVS. They are 90% the same, but
// expect a few different values.
function formatCapacity(slots) {
  // Bail out if there are no slots at all. The Walgreens API seems to do this
  // rather than include "busy" slots.
  if (!slots?.length) {
    return undefined;
  }

  const byDate = Object.create(null);
  for (const slot of slots) {
    const date = slot.start.slice(0, 10);
    const endDate = slot.end.slice(0, 10);

    // If the slot covers multiple days, we can't use it to calculate capacity.
    if (date !== endDate) {
      return undefined;
    }

    let available = slot.status === "free" ? Available.yes : Available.no;
    let capacity;
    let booking_url;
    for (const extension of slot.extension) {
      if (extension.url === EXTENSIONS.CAPACITY) {
        // TODO: should have something that automatically parses by value type.
        capacity = parseInt(extension.valueInteger);
        if (isNaN(capacity)) {
          available = Available.unknown;
          console.error(`Walgreens SMART: non-integer capcity: ${extension}`);
          Sentry.captureMessage(`Unparseable slot capacity`, {
            level: Sentry.Severity.Error,
            contexts: {
              raw_slot: slot,
            },
          });
        } else if (capacity !== 0 && capacity !== 5) {
          // The Walgreens API currently returns 0 (no appointments) or 5
          // (*some* appointments) rather than actual capacity estimates. It
          // doesn't indicate this in any way, so watch for unexpected values in
          // case something in their implementation to be more detailed.
          console.warn(`Got unexpected != 5 capacity for Walgreens: ${slot}`);
          Sentry.captureMessage(`Unexpected != 5 capacity for Walgreens`, {
            level: Sentry.Severity.Info,
            contexts: {
              raw_slot: slot,
            },
          });
        }
      } else if (extension.url === EXTENSIONS.BOOKING_DEEP_LINK) {
        booking_url = extension.valueUrl;
      } else {
        console.warn(`Got unexpected slot extension for Walgreens: ${slot}`);
        Sentry.captureMessage(`Unexpected slot extension for Walgreens`, {
          level: Sentry.Severity.Info,
          contexts: {
            raw_slot: slot,
          },
        });
      }
    }

    // TODO: look at the slot's schedule to determine product/dose.
    // Walgreens's current implementation doesn't specify those, but a more
    // general SMART Scheduling Links client will need to support it.

    if (byDate[date]) {
      if (available === Available.yes) {
        byDate[date].available = available;
      }
    } else {
      byDate[date] = {
        date,
        available,
        booking_url,
      };
    }
  }

  return Object.keys(byDate)
    .sort()
    .map((key) => byDate[key]);
}

async function checkAvailability(handler, options) {
  let states = [];
  if (options.walgreensStates) {
    states = options.walgreensStates.split(",").map((state) => state.trim());
  } else if (options.states) {
    states = options.states.split(",").map((state) => state.trim());
  }

  if (!states.length) {
    console.warn("No states specified for Walgreens");
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
