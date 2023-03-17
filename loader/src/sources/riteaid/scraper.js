/**
 * Rite Aid Scraper
 *
 * This pulls data from Rite Aid's booking website. The booking site runs on
 * a relatively nice XHR API, which makes this much nicer than it might
 * otherwise be. However, it's based on zip code + radius queries. The zip-codes
 * module has a list of zip codes that can be queried in order to efficiently
 * cover the entirety of a given state.
 */

const assert = require("node:assert/strict");
const { mapKeys } = require("lodash");
const { DateTime } = require("luxon");
const Sentry = require("@sentry/node");
const { Available, LocationType, VaccineProduct } = require("../../model");
const { assertSchema } = require("../../schema-validation");
const {
  httpClient,
  RateLimit,
  TIME_ZONE_OFFSET_STRINGS,
  createWarningLogger,
  parseUsPhoneNumber,
} = require("../../utils");
const {
  RiteAidApiError,
  getExternalIds,
  getLocationName,
  RITE_AID_STATES,
} = require("./common");
const { zipCodesCovering100Miles } = require("./zip-codes");

// Load slot-level data in chunks of this many stores at a time.
const SLOT_QUERY_CHUNK_SIZE = 25;

const API_URL =
  "https://www.riteaid.com/content/riteaid-web/en.racloudgetavailablestores.json";

const BOOKING_URL = "https://www.riteaid.com/pharmacy/covid-qualifier";

// Vaccine IDs used in Rite Aid's booking site.
// TODO: This data distinguishes boosters from dose 1/2, so we may want to add
// new VaccineProduct values to accomodate it.
const VACCINE_IDS = {
  "9-PREF-113": VaccineProduct.moderna, // Moderna Adult Dose 1 / 2, or Pfizer Adult Dose 2 (but in this case add `&dose1appointmentDate=2021-10-22T00:00:00`)
  // "42-PREF-113": VaccineProduct.moderna, // Moderna Adult Booster
  "11-PREF-114": VaccineProduct.pfizer, // Pfizer Adult Dose 1, or Pfizer Adult Dose 2 (but in this case add `&dose1appointmentDate=2021-10-22T00:00:00`)
  // "43-PREF-114": VaccineProduct.pfizer, // Pfizer Adult Booster
  "13-PREF-115": VaccineProduct.janssen, // J&J Adult Dose 1
  // "46-PREF-115": VaccineProduct.janssen, // J&J Adult Booster 1
  "47-PREF-122": VaccineProduct.pfizerAge5_11, // Pfizer Pediatric Dose 1
  "95-PREF-125": VaccineProduct.modernaBa4Ba5,
  "96-PREF-126": VaccineProduct.pfizerBa4Ba5,
};

// Same as above, but where the keys are just the number at the front. These
// are used when looking up which slots correspond to which vaccine in an API
// response.
const VACCINE_IDS_SHORT = mapKeys(VACCINE_IDS, (_, key) => key.split("-")[0]);

const warn = createWarningLogger("riteAidScraper");

async function queryZipCode(zip, radius = 100, stores = null) {
  const maximumResultCount = 100;

  const response = await httpClient({
    url: API_URL,
    searchParams: {
      address: zip,
      radius,
      vaccineIds: Object.keys(VACCINE_IDS).join(","),
      // This must be set, but `false` is a superset of `true`.
      showAllStoresWithAvailibility: false,
      count: maximumResultCount,
      // Must be set.
      fetchMechanismVersion: 2,
      // Optional: if a list of store numbers is set, the returned data will
      // have slot-level detail filled in for those stores. Otherwise, it will
      // only include the time of the first available slot for each store.
      storeNumbers: stores ? stores.join(",") : undefined,
      // Must be set along with `storeNumbers` to get slot data.
      loadMoreFlag: true,
    },
    responseType: "json",
    throwHttpErrors: false,
  });

  if (response.body.Status !== "SUCCESS") {
    throw new RiteAidApiError(response);
  }

  // This internal API returns only up to N locations and has no pagination.
  // If we get the maximum number of results back, we're probably missing data.
  assert.ok(
    response.body.data.stores?.length < maximumResultCount,
    `Query for zip code ${zip} had too many results`
  );

  return response.body;
}

async function* queryState(state, rateLimit = null, summaryOnly = false) {
  const zipCodes = zipCodesCovering100Miles[state];
  if (!zipCodes) {
    throw new Error(`There are no known zip codes to query in "${state}"`);
  }

  // Since we are querying by zip + radius, we have to have overlapping queries
  // and will get a lot of repeat results across queries. Be careful to filter
  // those out.
  const seenStores = new Set();
  for (const zipCode of zipCodes) {
    if (rateLimit) await rateLimit.ready();

    const body = await queryZipCode(zipCode);

    // If there are no results, `body.data.stores` is `null`.
    const stores = body.data.stores || [];
    const newStores = [];
    for (const item of stores) {
      if (!seenStores.has(item.storeNumber) && item.state === state) {
        seenStores.add(item.storeNumber);
        newStores.push(item.storeNumber);
      }
    }

    if (summaryOnly) {
      yield* newStores;
      continue;
    }

    // A query by zip code only returns a list of stores. You need to make the
    // same query again but with a list of store numbers to get actual
    // appointment slots.
    for (let i = 0; i < newStores.length; i += SLOT_QUERY_CHUNK_SIZE) {
      const chunk = newStores.slice(i, i + SLOT_QUERY_CHUNK_SIZE);
      const fullData = await queryZipCode(zipCode, 100, chunk);
      for (const item of fullData.data.stores || []) {
        yield item;
      }
    }
  }
}

// API data for each location should look like this. The schema is fairly strict
// since we are pulling on an unversioned API designed for the web UI, and want
// the system to scream at us for any potentially impactful change.
const riteAidLocationSchema = {
  type: "object",
  properties: {
    storeNumber: { type: "integer", minimum: 1 },
    brand: { enum: ["RITEAID", "BARTELL", "UNKNOWN", null] },
    customDisplayName: { type: "string", nullable: true },
    address: { type: "string" },
    city: { type: "string" },
    state: { type: "string", pattern: "[A-Z]{2}" },
    zipcode: { type: "string", pattern: "\\d{1,5}" },
    timeZone: {
      enum: ["EST", "EDT", "CST", "CDT", "MST", "MDT", "PST", "PDT"],
    },
    fullZipCode: { type: "string", pattern: "\\d{1,5}-\\d{1,4}" },
    fullPhone: { type: "string", nullable: true },
    locationDescription: { type: "string" },
    storeType: { enum: ["CORE"] },
    latitude: { type: "number" },
    longitude: { type: "number" },
    name: { type: "string" },
    milesFromCenter: { type: "number", minimum: 0 },
    totalSlotCount: { type: "integer", minimum: 0 },
    totalAvailableSlots: { type: "integer", minimum: 0 },
    firstAvailableSlot: { type: "string", format: "date-time", nullable: true },
    specialServiceKeys: { type: "array", items: { type: "string" } },
    availableSlots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string", format: "date" },
          available_slots: { type: "integer", minimum: 0 },
          slots: {
            type: "object",
            patternProperties: {
              "\\d+": {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    appointmentId: { type: "string", pattern: "\\d+" },
                    apptDateTime: { type: "string" },
                  },
                  required: ["appointmentId", "apptDateTime"],
                  additionalProperties: false,
                },
              },
            },
            additionalProperties: false,
          },
        },
        required: ["date", "available_slots", "slots"],
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};
riteAidLocationSchema.required = Object.keys(riteAidLocationSchema.properties);

function formatLocation(apiData) {
  assertSchema(riteAidLocationSchema, apiData);

  // There's a complicated situation where we may be dealing with a summary
  // object or with an object that has full slot detail. They both have the
  // same properties, but different values:
  //                     | Summary     | Detail
  //                     | ----------- | ------
  // totalSlotCount      | Number      | 0
  // totalAvailableSlots | 0           | Number
  // firstAvailableSlot  | Time string | null
  // availableSlots      | Empty array | Array with data in it
  //
  // Therefore, if we have slot data, we should use it. Otherwise look to see
  // if `firstAvailableSlot` is filled in, in which case we know not to try and
  // surface slots (if it's not filled in, surfacing an empty list of slots is
  // ok, because it is in fact accurate!).
  let slots;
  if (apiData.availableSlots.length > 0 || !apiData.firstAvailableSlot) {
    slots = formatSlots(apiData);
  }
  const isAvailable = slots?.length > 0 || apiData.firstAvailableSlot;

  const external_ids = getExternalIds(apiData.storeNumber);

  return {
    // `customDisplayName` looks like something that might apply here, but in
    // practice it doesn't seem useful. Values we've seen are:
    // null, "UNKNOWN", and "Edmonds" (name of the city the store is in)
    name: getLocationName(external_ids),
    external_ids,
    provider: "rite_aid",
    location_type: LocationType.pharmacy,

    address_lines: [apiData.address],
    city: apiData.city,
    state: apiData.state,
    postal_code: apiData.zipcode.padStart(5, "0"),
    position: {
      latitude: apiData.latitude,
      longitude: apiData.longitude,
    },

    booking_url: BOOKING_URL,
    info_phone: apiData.fullPhone && parseUsPhoneNumber(apiData.fullPhone),
    description: apiData.locationDescription,

    meta: {
      // TODO: format the time zone correctly, e.g. "America/Los_Angeles"
      // time_zone: apiData.timeZone,
    },

    availability: {
      source: "univaf-rite-aid-scraper",
      checked_at: DateTime.utc().toString(),
      available: isAvailable ? Available.yes : Available.no,
      slots,
    },
  };
}

const timestampPattern =
  /^\d{4}-\d\d-\d\d[T\s]\d\d:\d\d:\d\d(?:\.\d+)?(?<offset>Z|[+-]\d\d:?\d\d)?$/;

// availableSlots is an array of objects representing each day, e.g:
//   {
//     date: '2021-11-23',
//     available_slots: 1,
//     slots: {
//       '9': [{appointmentId: '64271018', apptDateTime: '2021-11-23T17:00:00'}],
//       '11': [{appointmentId: '64271018', apptDateTime: '2021-11-23T17:00:00'}],
//       '13': [],
//       '42': [{appointmentId: '64271018', apptDateTime: '2021-11-23T17:00:00'}],
//       '43': [{appointmentId: '64271018', apptDateTime: '2021-11-23T17:00:00'}],
//       '46': [],
//       '47': []
//     }
//   }
// They keys for slots indicate the vaccine type. Note the same slot may be
// listed with more than one vaccine type.
function formatSlots(location) {
  const { availableSlots, timeZone, storeNumber } = location;
  const timeOffset = TIME_ZONE_OFFSET_STRINGS[timeZone];
  if (!timeOffset) {
    throw new Error(`Unknown time zone: "${timeZone}"`);
  }

  const slotsById = Object.create(null);
  const handledDates = new Set();
  let expectedSlots = 0;

  for (const day of availableSlots) {
    // Some dates show up multiple times in the API, so don't double-count.
    // (It's not clear why this is happening, but they appear to be duplicate
    // entries with the same slot IDs. Only skip them for counting expected
    // slots so we'll still fail and get a warn if one day we say a different
    // set of slot IDs in two entries for the same day.)
    if (!handledDates.has(day.date)) {
      expectedSlots += day.available_slots;
      handledDates.add(day.date);
    }

    for (const [vaccineKey, slots] of Object.entries(day.slots)) {
      const product = VACCINE_IDS_SHORT[vaccineKey];
      if (!product) {
        warn(`Unknown product ID: ${vaccineKey}`);
        continue;
      }

      for (const slot of slots) {
        let actualSlot = slotsById[slot.appointmentId];
        if (!actualSlot) {
          let timestamp = slot.apptDateTime;
          const timestampInfo = timestamp.match(timestampPattern);
          if (!timestampInfo) {
            warn(`Invalid timestamp`, { timestamp });
            continue;
          } else if (!timestampInfo.groups.offset) {
            timestamp += timeOffset;
          }

          actualSlot = slotsById[slot.appointmentId] = {
            start: timestamp,
            // end: undefined,  // No end time in source data
            available: Available.yes, // We only have these for available slots
            products: [],
          };
        }
        if (!actualSlot.products.includes(product)) {
          actualSlot.products.push(product);
        }
      }
    }
  }

  const allSlots = Object.values(slotsById).sort((a, b) =>
    a.start < b.start ? -1 : 1
  );

  // Sanity-check
  if (allSlots.length !== expectedSlots) {
    const error = new Error(
      `Expected and actual slots did not match for store ${storeNumber}`
    );
    error.data = {
      expected: expectedSlots,
      actual: allSlots.length,
    };
    throw error;
  }

  return allSlots;
}

async function checkAvailability(
  handler,
  { states = RITE_AID_STATES, rateLimit }
) {
  const rateLimiter = new RateLimit(rateLimit || 1);

  const results = [];
  for (const state of states) {
    for await (const apiLocation of queryState(state, rateLimiter)) {
      let location;
      Sentry.withScope((scope) => {
        scope.setContext("location", {
          id: apiLocation.storeNumber,
          provider: "rite_aid",
        });
        location = formatLocation(apiLocation);
      });
      handler(location);
      results.push(location);
    }
  }

  return results;
}

module.exports = {
  API_URL,
  VACCINE_IDS,
  VACCINE_IDS_SHORT,
  checkAvailability,
  queryState,
  queryZipCode,
};
