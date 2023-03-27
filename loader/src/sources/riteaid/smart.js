/**
 * Load data from Rite Aid's SMART Scheduling Links API.
 */

const assert = require("node:assert/strict");
const { Available, LocationType } = require("../../model");
const {
  titleCase,
  unpadNumber,
  createWarningLogger,
  DEFAULT_STATES,
} = require("../../utils");
const {
  EXTENSIONS,
  SmartSchedulingLinksApi,
  getLocations,
  getExtensions,
  valuesAsObject,
  formatExternalIds,
} = require("../../smart-scheduling-links");
const { getExternalIds, getLocationName } = require("./common");

const API_URL =
  "https://api.riteaid.com/digital/vaccine-provider/$bulk-publish";

const warn = createWarningLogger("riteAidSmart");
const logError = createWarningLogger("riteAidSmart", "error");

/**
 * Get an array of UNIVAF-formatted locations & availabilities from the
 * SMART SL API.
 * @returns {Promise<Array<any>>}
 */
async function getData(states) {
  const api = new SmartSchedulingLinksApi(API_URL);
  const smartLocations = await getLocations(api, states);
  return Object.values(smartLocations).map((entry) => formatLocation(entry));
}

function formatLocation(locationInfo) {
  const smartLocation = locationInfo.location;

  const external_ids = formatExternalIds(smartLocation);
  const npiNumber = external_ids.find((id) => id[0] === "npi_usa")?.[1];
  let meta;
  if (npiNumber) {
    meta = { npi_usa: npiNumber };
  }

  const vtrcks = external_ids.find((id) => id[0] === "vtrcks")?.[1];
  const storeNumber = smartLocation.id;
  if (vtrcks) {
    assert.equal(
      storeNumber,
      unpadNumber(vtrcks.slice(3)),
      "Store number should == VTrckS PIN without prefix"
    );
    external_ids.push(...getExternalIds(storeNumber));
  } else {
    warn(
      "Rite Aid store missing VTrckS PIN",
      { identifiers: smartLocation.identifier },
      true
    );
  }

  // All slots for a location share an identical booking URL/phone,
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

  const checkTime = new Date().toISOString();
  return {
    // The API does not return useful store names, so make up our own.
    name: getLocationName(external_ids),
    description: smartLocation.description,
    external_ids,
    provider: "rite_aid",
    location_type: LocationType.pharmacy,

    address_lines: smartLocation.address.line,
    city: smartLocation.address.city,
    state: smartLocation.address.state,
    postal_code: smartLocation.address.postalCode,
    county:
      smartLocation.address.district &&
      titleCase(smartLocation.address.district),
    position,

    info_phone,
    info_url,
    booking_phone,
    booking_url,
    meta,

    availability: {
      source: "univaf-rite-aid-smart",
      checked_at: checkTime,
      is_public: true,
      available,
      capacity: capacity || undefined,
    },
  };
}

// TODO: unify this with similar code for CVS & Walgreens. They are 90% the
// same, but expect a few different values.
function formatCapacity(slots) {
  // Bail out if there are no slots at all. The API seems to do this rather than
  // include "busy" slots.
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
          logError(`Non-integer capacity: ${extension}`, { slot }, true);
        } else if (capacity < 0) {
          available = Available.unknown;
          logError(`Negative capacity: ${extension}`, { slot }, true);
        }
      } else if (extension.url === EXTENSIONS.BOOKING_DEEP_LINK) {
        booking_url = extension.valueUrl;
      } else if (extension.url === EXTENSIONS.BOOKING_PHONE) {
        // We only surface this on the location level.
      } else {
        warn("Unexpected slot extension", { extension }, true);
      }
    }

    // NOTE: in a generic situation, we should look at the slot's schedule to
    // determine product/dose. However, Rite Aid's dose extension is broken.

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

async function checkAvailability(handler, { states = DEFAULT_STATES }) {
  const stores = await getData(states);
  stores.forEach((store) => handler(store));
  return stores;
}

module.exports = {
  checkAvailability,
  API_URL,
};
