/**
 * Rite Aid Scraper
 *
 * This pulls data from Rite Aid's booking website. The booking site runs on
 * a relatively nice XHR API, which makes this much nicer than it might
 * otherwise be. However, it's based on zip code + radius queries. The zip-codes
 * module has a list of zip codes that can be queried in order to efficiently
 * cover the entirety of a given state.
 */

const { mapKeys } = require("lodash");
const { DateTime } = require("luxon");
const Sentry = require("@sentry/node");
const { HttpApiError } = require("../../exceptions");
const { Available, LocationType, VaccineProduct } = require("../../model");
const {
  httpClient,
  RateLimit,
  TIME_ZONE_OFFSET_STRINGS,
  createWarningLogger,
} = require("../../utils");
const { zipCodesCovering100Miles } = require("./zip-codes");

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
};

// Same as above, but where the keys are just the number at the front. These
// are used when looking up which slots correspond to which vaccine in an API
// response.
const VACCINE_IDS_SHORT = mapKeys(VACCINE_IDS, (_, key) => key.split("-")[0]);

const warn = createWarningLogger("Rite Aid Scraper");

class RiteAidXhrError extends HttpApiError {
  parse(response) {
    super.parse(response);
    this.message = `${this.details.Status} ${this.details.ErrCde}: ${this.details.ErrMsg}`;
  }
}

async function queryZipCode(zip, radius = 100) {
  const response = await httpClient({
    url: API_URL,
    searchParams: {
      address: zip,
      radius,
      vaccineIds: Object.keys(VACCINE_IDS).join(","),
      // This must be set, but `false` is a superset of `true`.
      showAllStoresWithAvailibility: false,
      // There is no obvious paging mechanism, but this seems to work, and is
      // probably big enough to cover any 100 mile radius query.
      count: 1000,
      // Must be set.
      fetchMechanismVersion: 2,
    },
    responseType: "json",
  });

  if (response.body.Status !== "SUCCESS") {
    throw new RiteAidXhrError(response);
  }

  return response.body;
}

async function* queryState(state, rateLimit = null) {
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
    for (const item of body.data.stores) {
      if (!seenStores.has(item.storeNumber)) {
        seenStores.add(item.storeNumber);
        yield item;
      }
    }
  }
}

function formatLocation(apiData) {
  const slots = formatSlots(apiData);

  return {
    name: `Rite Aid #${apiData.storeNumber}`,
    external_ids: [["rite_aid", apiData.storeNumber.toString()]],
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
    info_phone: apiData.fullPhone,
    description: apiData.locationDescription,

    meta: {
      // TODO: format the time zone correctly, e.g. "America/Los_Angeles"
      // time_zone: apiData.timeZone,
    },

    availability: {
      source: "univaf-rite-aid-scraper",
      checked_at: DateTime.utc().toString(),
      available: slots.length > 0 ? Available.yes : Available.no,
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
  let expectedSlots = 0;

  for (const day of availableSlots) {
    expectedSlots += day.available_slots;

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
        actualSlot.products.push(product);
      }
    }
  }

  const allSlots = Object.values(slotsById).sort((a, b) =>
    a.start < b.start ? -1 : 1
  );

  // Sanity-check
  if (allSlots.length !== expectedSlots) {
    throw new Error(
      `Expected and actual slots did not match for store ${storeNumber}`
    );
  }

  return allSlots;
}

async function checkAvailability(handler, options) {
  let states = [];
  if (options.riteAidStates) {
    states = options.riteAidStates.split(",").map((state) => state.trim());
  } else if (options.states) {
    states = options.states.split(",").map((state) => state.trim());
  }

  if (!states.length) {
    console.warn(`No states set for riteAidApi`);
  }

  if (options.rateLimit != null && isNaN(options.rateLimit)) {
    throw new Error("Invalid --rate-limit set.");
  }

  const rateLimit = new RateLimit(options.rateLimit || 1);

  const results = [];
  for (const state of states) {
    for await (const apiLocation of queryState(state, rateLimit)) {
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
  RiteAidXhrError,
  checkAvailability,
  queryState,
  queryZipCode,
};
