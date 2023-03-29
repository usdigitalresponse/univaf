const got = require("got");
const { DateTime } = require("luxon");
const Sentry = require("@sentry/node");
const geocoding = require("../../geocoding");
const { ParseError } = require("../../exceptions");
const { Available, LocationType } = require("../../model");
const {
  createWarningLogger,
  httpClient,
  parseUsPhoneNumber,
  RateLimit,
} = require("../../utils");
const {
  assertSchema,
  requireAllProperties,
} = require("../../schema-validation");
const {
  RITE_AID_STATES,
  RiteAidApiError,
  getExternalIds,
  getLocationName,
  MINIMUM_403_RETRY_DELAY,
} = require("./common");

const warn = createWarningLogger("riteAidApi");

// Log a warning if a location has more than this many slots in a given day.
const MAXIMUM_SLOT_COUNT = 500;

const riteAidWrapperSchema = requireAllProperties({
  type: "object",
  properties: {
    Status: { type: "string" },
    ErrCde: {},
    ErrMsg: {},
    ErrMsgDtl: {},
    Data: requireAllProperties({
      type: "object",
      properties: {
        providerDetails: { type: "array" },
      },
      additionalProperties: false,
    }),
  },
});

const riteAidLocationSchema = requireAllProperties({
  type: "object",
  properties: {
    id: { type: "integer", minimum: 1 },
    // parseUpdateTime() does fancy checking, so no need to check format here.
    last_updated: { type: "string" },
    name: { type: "string", pattern: "Rite Aid" },
    location: requireAllProperties({
      type: "object",
      properties: {
        resourceType: { type: "null" },
        id: { type: "null" },
        identifier: { type: "null" },
        name: { type: "null" },
        telecom: { type: "null" },
        address: { type: "null" },
        position: { type: "null" },
        meta: { type: "null" },
        description: { type: "null" },
        street: { type: "string" },
        street_line_2: { type: "string", nullable: true },
        city: { type: "string" },
        state: { type: "string", pattern: "[A-Z]{2}" },
        zipcode: { type: "string", pattern: "\\d{1,5}(-\\d{4})?" },
        county: { type: "null" },
      },
      additionalProperties: false,
    }),
    contact: requireAllProperties({
      type: "object",
      properties: {
        booking_phone: { type: "string", nullable: true },
        booking_url: { type: "string", format: "uri" },
        info_phone: { type: "string", nullable: true },
        info_url: { type: "string", format: "uri" },
      },
      additionalProperties: false,
    }),
    availability: {
      type: "array",
      items: requireAllProperties({
        type: "object",
        properties: {
          date: { type: "string", format: "date" },
          total_slots: { type: "integer", minimum: 0 },
          available_slots: { type: "integer", minimum: 0 },
        },
        additionalProperties: false,
      }),
    },
  },
  additionalProperties: false,
});

async function queryState(state, rateLimit = null) {
  const RITE_AID_URL = process.env["RITE_AID_URL"];
  const RITE_AID_KEY = process.env["RITE_AID_KEY"];

  if (!RITE_AID_URL || !RITE_AID_KEY) {
    throw new Error(
      "RITE_AID_URL and RITE_AID_KEY must be provided as environment variables"
    );
  }

  if (rateLimit) await rateLimit.ready();

  const response = await httpClient({
    url: RITE_AID_URL,
    headers: { "Proxy-Authorization": "ldap " + RITE_AID_KEY },
    searchParams: { stateCode: state },
    responseType: "json",
    retry: {
      // This endpoint occasionally produces 403 status codes. We think this is
      // an anti-abuse measure, so we still want to retry, but with a longer
      // than normal delay.
      statusCodes: [...got.default.defaults.options.retry.statusCodes, 403],
      calculateDelay({ error, computedValue }) {
        if (error.response.statusCode === 403 && computedValue > 0) {
          return Math.max(computedValue, MINIMUM_403_RETRY_DELAY);
        }
        return computedValue;
      },
    },
  });

  if (response.body.Status !== "SUCCESS") {
    throw new RiteAidApiError(response);
  }

  assertSchema(
    riteAidWrapperSchema,
    response.body,
    "Response did not match schema"
  );

  return response.body.Data.providerDetails;
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
  assertSchema(
    riteAidLocationSchema,
    provider,
    "API location did not match schema"
  );

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

  const external_ids = getExternalIds(provider.id);

  return {
    name: getLocationName(external_ids),
    external_ids,
    provider: "rite_aid",
    location_type: LocationType.pharmacy,

    address_lines,
    city: provider.location.city,
    state: provider.location.state,
    postal_code: provider.location.zipcode,
    county,
    booking_phone:
      provider.contact.booking_phone &&
      parseUsPhoneNumber(provider.contact.booking_phone),
    booking_url: provider.contact.booking_url,
    info_phone:
      provider.contact.info_phone &&
      parseUsPhoneNumber(provider.contact.info_phone),
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
  let maxDailySlots = 0;
  const result = provider.availability.map((apiData) => {
    maxDailySlots = Math.max(maxDailySlots, apiData.total_slots);
    if (apiData.available_slots > apiData.total_slots) {
      throw new Error("More available slots than total slots at a Rite Aid");
    }

    return {
      date: apiData.date,
      available: apiData.available_slots > 0 ? Available.yes : Available.no,
      available_count: apiData.available_slots,
      unavailable_count: apiData.total_slots - apiData.available_slots,
    };
  });

  if (maxDailySlots > MAXIMUM_SLOT_COUNT) {
    warn(
      "Unrealistic slot count at a Rite Aid",
      { slots: maxDailySlots },
      true
    );
  }

  return result;
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

async function checkAvailability(
  handler,
  { states = RITE_AID_STATES, rateLimit }
) {
  const rateLimiter = new RateLimit(rateLimit || 1);

  let results = [];
  for (const state of states) {
    // Sentry's withScope() doesn't work for async code, so we have to manually
    // track the context data we want to add. :(
    const errorContext = { state, source: "Rite Aid API" };

    const stores = [];
    try {
      const rawData = await queryState(state, rateLimiter);
      for (const rawLocation of rawData) {
        Sentry.withScope((scope) => {
          scope.setContext("context", errorContext);
          scope.setContext("location", { id: rawLocation.id });
          try {
            stores.push(formatStore(rawLocation));
          } catch (error) {
            warn(error);
          }
        });
      }
    } catch (error) {
      warn(error, errorContext, true);
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
