const { DateTime } = require("luxon");
const geocoding = require("../../geocoding");
const { ParseError } = require("../../exceptions");
const { Available, LocationType } = require("../../model");
const { createWarningLogger, httpClient, RateLimit } = require("../../utils");

const warn = createWarningLogger("Rite Aid API");

// States in which Rite Aid has stores.
const riteAidStates = new Set([
  "CA",
  "CO",
  "CT",
  "DE",
  "ID",
  "MA",
  "MD",
  "MI",
  "NH",
  "NJ",
  "NV",
  "NY",
  "OH",
  "OR",
  "PA",
  "VA",
  "VT",
  "WA",
]);

async function queryState(state, rateLimit = null) {
  const RITE_AID_URL = process.env["RITE_AID_URL"];
  const RITE_AID_KEY = process.env["RITE_AID_KEY"];

  if (!RITE_AID_URL || !RITE_AID_KEY) {
    throw new Error(
      "RITE_AID_URL and RITE_AID_KEY must be provided as environment variables"
    );
  }

  if (rateLimit) await rateLimit.ready();

  const body = await httpClient({
    url: RITE_AID_URL,
    headers: { "Proxy-Authorization": "ldap " + RITE_AID_KEY },
    searchParams: { stateCode: state },
  }).json();

  if (body.Status !== "SUCCESS") {
    console.error(body.Status);
    console.error(body.ErrCde);
    console.error(body.ErrMsg);
    console.error(body.ErrMsgDtl);

    throw new Error("RiteAid API request failed");
  }

  return body.Data.providerDetails;
}

/**
 * Parse Rite Aid-style datetimes (their format is entirely non-standard).
 * @param {string} text
 * @returns {DateTime}
 */
function parseUpdateTime(text) {
  let validTime;
  if (/^\d{4}\/\d\d\/\d\d \d\d:\d\d:\d\d$/.test(text)) {
    validTime = DateTime.fromFormat(text, "yyyy/MM/dd HH:mm:ss", {
      zone: "UTC",
    });
  } else if (text) {
    validTime = DateTime.fromISO(text);
  }

  if (validTime.isValid) {
    // Sanity-check that the date appears reasonable, in case the time zone
    // changed or the format changed in another subtle way.
    const offset = validTime.diffNow("hours").hours;
    if (offset >= 0 || offset < -2) {
      throw new ParseError(`Offset from now (${offset} hours) is too large`);
    }

    return validTime;
  } else {
    throw new ParseError(
      `${validTime.invalidReason}: ${validTime.invalidExplanation}`
    );
  }
}

function formatStore(provider) {
  const address = formatAddress(provider.location);

  let county = provider.location.county;
  if (!county) county = geocoding.guessCounty(address);

  const address_lines = [provider.location.street];
  if (provider.location.street_line_2) {
    address_lines.push(provider.location.street_line_2);
  }

  const checked_at = DateTime.utc().toString();
  let valid_at;
  try {
    valid_at = parseUpdateTime(provider.last_updated).toUTC().toString();
  } catch (error) {
    warn(error);
    valid_at = checked_at;
  }

  return {
    // All API locations are named "Rite Aid", so add the store number.
    name: `Rite Aid #${provider.id}`,
    external_ids: [["rite_aid", provider.id.toString()]],
    provider: "rite_aid",
    location_type: LocationType.pharmacy,

    address_lines,
    city: provider.location.city,
    state: provider.location.state,
    postal_code: provider.location.zipcode,
    county,
    booking_phone: provider.contact.booking_phone,
    booking_url: provider.contact.booking_url,
    info_phone: provider.contact.info_phone,
    info_url: provider.contact.info_url,

    availability: {
      source: "univaf-rite-aid-api",
      valid_at,
      checked_at,
      available: formatAvailable(provider),
      capacity: formatCapacity(provider),
    },
  };
}

function formatAvailable(provider) {
  if (provider.availability.some((date) => date.available_slots > 0)) {
    return Available.yes;
  }
  return Available.no;
}

function formatCapacity(provider) {
  return provider.availability.map((apiData) => ({
    date: apiData.date,
    available: apiData.available_slots > 0 ? Available.yes : Available.no,
    available_count: apiData.available_slots,
    unavailable_count: apiData.total_slots - apiData.available_slots,
  }));
}

function formatAddress(location) {
  // Our static geocode data does not support the 4 digit extended format, so
  // we are stripping it.
  const zipCode = location.zipcode.split("-")[0];
  if (location.street_line_2) {
    return `${location.street} ${location.street_line_2}, ${location.city}, ${location.state}, ${zipCode}`;
  }
  return `${location.street}, ${location.city}, ${location.state}, ${zipCode}`;
}

async function checkAvailability(handler, options) {
  let states = [];
  if (options.riteAidStates) {
    states = options.riteAidStates.split(",").map((state) => state.trim());
  } else if (options.states) {
    states = options.states.split(",").map((state) => state.trim());
  }
  // Rite Aid only has stores in a few states, so filter down to those.
  states = states.filter((state) => riteAidStates.has(state));

  if (!states.length) {
    const statesText = Array.from(riteAidStates).join(", ");
    console.warn(`No states set for riteAidApi (supported: ${statesText})`);
  }

  if (options.rateLimit != null && isNaN(options.rateLimit)) {
    throw new Error("Invalid --rate-limit set.");
  }

  const rateLimit = new RateLimit(options.rateLimit || 1);

  let results = [];
  for (const state of states) {
    let stores;
    try {
      const rawData = await queryState(state, rateLimit);
      stores = rawData.map(formatStore);
    } catch (error) {
      warn(error, { state, source: "Rite Aid API" }, true);
      continue;
    }

    stores.forEach((store) => handler(store));
    results = results.concat(stores);
  }

  return results;
}

module.exports = {
  checkAvailability,
  queryState,
  formatAvailable,
  formatStore,
};
