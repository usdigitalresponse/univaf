/**
 * Load data from Kroger's SMART Scheduling Links API
 * https://github.com/smart-on-fhir/smart-scheduling-links/
 */

const Sentry = require("@sentry/node");
const { Available, LocationType } = require("../model");
const { unpadNumber, getUniqueExternalIds } = require("../utils");
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

function warn(message, context) {
  console.warn(`Kroger: ${message}`, context);
  Sentry.captureMessage(message, Sentry.Severity.Info);
}

/**
 * Get an array of UNIVAF-formatted locations & availabilities from the
 * SMART SL API.
 * @returns {Array<any>}
 */
async function getData(states) {
  const api = new SmartSchedulingLinksApi(API_URL);
  const manifest = await api.getManifest();
  const smartLocations = await getLocations(api, states);
  return Object.values(smartLocations)
    .map((entry) => formatLocation(manifest.transactionTime, entry))
    .filter(Boolean);
}

const KROGER_BRAND_ID_SYSTEMS = [
  { pattern: /^Harris Teeter/i, system: "kroger_hart" },
  { pattern: /^Copps Pharmacy/i, system: "kroger_copps" },
  { pattern: /^Dillons Pharmacy/i, system: "kroger_dillons" },
  { pattern: /^Fred Meyer Pharmacy/i, system: "kroger_fred" },
  { pattern: /^Frys Pharmacy/i, system: "kroger_frys" },
  { pattern: /^Gerbes Pharmacy/i, system: "kroger_gerbes" },
  { pattern: /^JayC Pharmacy/i, system: "kroger_jayc" },
  { pattern: /^King Soopers Pharmacy/i, system: "kroger_kingsoopers" },
  { pattern: /^Kroger Pharmacy/i, system: "kroger" },
  { pattern: /^Mariano's Pharmacy/i, system: "kroger_marianos" },
  { pattern: /^Metro Market Pharmacy/i, system: "kroger_metro_market" },
  { pattern: /^Pick 'n Save Pharmacy/i, system: "kroger_pick_n_save" },
  { pattern: /^QFC Pharmacy/i, system: "kroger_qfc" },
  { pattern: /^Ralphs Pharmacy/i, system: "kroger_ralphs" },
  { pattern: /^Smith's Pharmacy/i, system: "kroger_smiths" },
  {
    pattern: /^City Market Pharmacy/i,
    getIds(location) {
      const ids = [["kroger_citymarket", location.id]];
      // We have existing records for all the same places that start with "625",
      // but instead our existing IDs are "620...". Add those IDs to facilitate
      // matching.
      if (location.id.startsWith("625")) {
        ids.push(["kroger_citymarket", `620${location.id.slice(3)}`]);
      }
      return ids;
    },
  },
  {
    pattern: /^The Little Clinic/i,
    getIds(location) {
      const ids = [["kroger_the_little_clinic", location.id]];

      // The Little Clinic often uses a different 5-digit identifier. These are
      // mappable to the 8-digit IDs, though! 5-digit IDs have a 2-digit prefix
      // that corresponds to a 5-digit prefix for the 8-digit ID.
      // (The ID may also be an unpadded 4-digit number.)
      const shortId = location.id.padStart(5, "0");
      if (shortId.length === 5) {
        const prefixMap = {
          "03": "85100",
          "06": "85200",
          11: "85600",
          15: "85800",
          17: "86100",
          18: "85300",
          36: "85400",
          43: "85500",
          47: "85900",
        };
        const prefix = shortId.slice(0, 2);
        const newPrefix = prefixMap[prefix];
        if (newPrefix) {
          const longId = `${newPrefix}${shortId.slice(2)}`;
          ids.push(["kroger_the_little_clinic", longId], ["kroger", longId]);
        } else {
          warn(`Unknown ID prefix for The Little Clinic "${shortId}"`, {
            id: location.id,
            name: location.name,
            state: location.address.state,
          });
        }
      }

      return ids;
    },
  },
];

function formatKrogerExternalIds(location) {
  // Get generic, SMART IDs.
  let external_ids = formatExternalIds(location, {
    smartIdName: "kroger",
  });

  // Kroger's API returns differentiated data for a whole mess of sub-brands.
  let foundSubBrand = false;
  for (const brandSystem of KROGER_BRAND_ID_SYSTEMS) {
    if (brandSystem.pattern.test(location.name)) {
      foundSubBrand = true;
      if (brandSystem.getIds) {
        external_ids.push(...brandSystem.getIds(location));
      } else {
        external_ids.push([brandSystem.system, location.id]);
      }
    }
  }
  if (!foundSubBrand) {
    warn(`Unknown sub-brand for Kroger store "${location.name}"`, {
      id: location.id,
      name: location.name,
      state: location.address.state,
    });
  }

  external_ids = external_ids.flatMap((id) => [
    id,
    [id[0], unpadNumber(id[1])],
  ]);

  return getUniqueExternalIds(external_ids);
}

function formatLocation(validTime, locationInfo) {
  const smartLocation = locationInfo.location;

  // 99999 and similar IDs are test locations. Don't include them.
  if (/^9+$/.test(smartLocation.id)) return null;

  const external_ids = formatKrogerExternalIds(smartLocation);
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
