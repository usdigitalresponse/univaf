const { DateTime } = require("luxon");
const got = require("got");
const Sentry = require("@sentry/node");
const geocoding = require("../../geocoding");
// const { logger } = require("../logging");
const { Available, LocationType } = require("../../model");

// FIXME: need to implement proper logging
// const log = logger.child({ source: "riteaidApi" });
const log = console;

async function queryState(state) {
  const RITE_AID_URL = process.env["RITE_AID_URL"];
  const RITE_AID_KEY = process.env["RITE_AID_KEY"];

  if (!RITE_AID_URL || !RITE_AID_KEY) {
    throw new Error(
      "RITE_AID_URL and RITE_AID_KEY must be provided as environment variables"
    );
  }

  const body = await got({
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

  return body.Data.providerDetails.map(formatStore);
}

function formatStore(provider) {
  const address = formatAddress(provider.location);

  let county = provider.location.county;
  if (!county) county = geocoding.guessCounty(address);
  if (!county) log.warn(`No county for store ${provider.id}`);

  const address_lines = [provider.location.street];
  if (provider.location.street_line_2) {
    address_lines.push(provider.location.street_line_2);
  }

  const checked_at = DateTime.utc().toString();
  let valid_at;
  let validTime;
  if (/^\d{4}\/\d\d\/\d\d \d\d:\d\d:\d\d$/.test(provider.last_updated)) {
    validTime = DateTime.fromFormat(
      provider.last_updated,
      "yyyy/MM/dd hh:mm:ss",
      { zone: "America/New_York" }
    );
  } else if (provider.last_updated) {
    validTime = DateTime.fromISO(provider.last_updated);
  }

  if (validTime.isValid) {
    valid_at = validTime.toUTC().toString();
  } else {
    const message = `Error parsing "last_updated": ${validTime.invalidReason}: ${validTime.invalidExplanation}`;
    console.error(message);
    Sentry.captureMessage(message, Sentry.Severity.ERROR);
    valid_at = checked_at;
  }

  return {
    id: `rite_aid:${provider.id}`,
    // All API locations are named "Rite Aid", so add the store number.
    name: `Rite Aid #${provider.id}`,
    external_ids: { rite_aid: provider.id.toString() },
    provider: "RiteAid",
    location_type: LocationType.pharmacy,

    address_lines,
    city: provider.location.city,
    state: provider.location.state,
    postal_code: provider.location.zipcode,
    county,
    position: null,
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

  if (!states.length) console.warn("No states specified for riteAidApi");

  let results = [];
  for (const state of states) {
    let stores = await queryState(state);
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
