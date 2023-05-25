/**
 * Load data from Kroger's SMART Scheduling Links API
 * https://github.com/smart-on-fhir/smart-scheduling-links/
 *
 * A note on Kroger IDs:
 * Kroger is both a supermarket/pharmacy chain and an umbrella company for
 * variety of other supermarket and pharmacy brands. Since we have a variety of
 * data from other sources keyed to these sub-brands, we do a lot of work here
 * to come up with the broadest set of IDs we can for effective matching.
 *
 * In the SMART Scheduling Links API, most locations use an 8-digit ID. These
 * IDs are actually a 3-digit division code (e.g. "Mid Atlantic" is 029,
 * "Nashville" is 026, etc.) followed by a 5-digit store number. This gets a
 * little rocky when it comes to pop-up events and clinics or other
 * non-permanent facilities/stores, though -- according to Kroger's tech folks,
 * their business teams sometimes come up with new numbering schemes for these.
 * They may fit into the 3 + 5 scheme (but use division codes that don't match
 * what you might expect for their geographic area) or may be an entirely
 * different size string, but are guaranteed not to collide with other existing
 * store numbers. You can see one flavor of this with the IDs for
 * "The Little Clinic" locations.
 */

const { Available, LocationType } = require("../../model");
const {
  unpadNumber,
  getUniqueExternalIds,
  createWarningLogger,
  DEFAULT_STATES,
} = require("../../utils");
const {
  EXTENSIONS,
  SmartSchedulingLinksApi,
  getLocations,
  formatExternalIds,
  valuesAsObject,
  getExtensions,
} = require("../../smart-scheduling-links");

const API_URL =
  "https://api.kroger.com/v1/health-wellness/schedules/vaccines/$bulk-publish";

const warn = createWarningLogger("krogerSmart");

/**
 * Get an array of UNIVAF-formatted locations & availabilities from the
 * SMART SL API.
 * @returns {Promise<Array<any>>}
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
  { pattern: /^Baker's Pharmacy/i, system: "kroger_bakers" },
  { pattern: /^Copps Pharmacy/i, system: "kroger_copps" },
  { pattern: /^Dillons Pharmacy/i, system: "kroger_dillons" },
  { pattern: /^Food[-\s]4[-\s]Less/i, system: "kroger_food_4_less" },
  { pattern: /^Foods Co/i, system: "kroger_foods_co" },
  { pattern: /^Fred Meyer Pharmacy/i, system: "kroger_fred" },
  { pattern: /^Frys Pharmacy/i, system: "kroger_frys" },
  { pattern: /^Gerbes Pharmacy/i, system: "kroger_gerbes" },
  { pattern: /^Harris Teeter/i, system: "kroger_hart" },
  { pattern: /^JayC Pharmacy/i, system: "kroger_jayc" },
  { pattern: /^King Soopers Pharmacy/i, system: "kroger_kingsoopers" },
  { pattern: /^Kroger Pharmacy/i, system: "kroger" },
  { pattern: /^Mariano's Pharmacy/i, system: "kroger_marianos" },
  { pattern: /^Metro Market Pharmacy/i, system: "kroger_metro_market" },
  { pattern: /^Pay[-\s]?less/i, system: "kroger_payless" },
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
          warn(
            `Unknown ID prefix for The Little Clinic "${shortId}"`,
            {
              id: location.id,
              name: location.name,
              state: location.address.state,
            },
            true
          );
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
    warn(
      `Unknown sub-brand for Kroger store "${location.name}"`,
      {
        id: location.id,
        name: location.name,
        state: location.address.state,
      },
      true
    );
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
  const booking_url = getBookingLink(locationInfo);

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

/**
 * Get a booking link from the slots. All slots currently share a booking link,
 * but this will validate that and warn us if that ever changes.
 * @returns {string}
 */
function getBookingLink(locationInfo) {
  if (!locationInfo.slots) return null;

  let link;
  for (const slot of locationInfo.slots) {
    const slotLink = getExtensions(slot)[EXTENSIONS.BOOKING_DEEP_LINK];
    if (!link) {
      link = slotLink;
    } else if (link !== slotLink) {
      warn(
        "Kroger slots have different booking links",
        {
          id: locationInfo.location.id,
          name: locationInfo.location.name,
          state: locationInfo.location.address.state,
        },
        true
      );
      return null;
    }
  }

  return link;
}

// TODO: unify this with similar code for CVS & Walgreens. They are largely the
// same, but expect a few different values.
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
        if (isNaN(capacity) || capacity < 0) {
          available = Available.unknown;
          warn("Invalid slot capacity", { extension });
        }
      } else if (extension.url === EXTENSIONS.BOOKING_DEEP_LINK) {
        // We don't use the Booking URL; we hardcode a better one that puts you
        // directly into the screener flow instead of an interstitial page.
        // bookingLink = extension.valueUrl;
      } else {
        warn("Unexpected slot extension", slot);
      }
    }

    // TODO: look at the slot's schedule to determine product/dose.
    // Kroger's current implementation doesn't specify those, but a more general
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
  API_URL,
};
