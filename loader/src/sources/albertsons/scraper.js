/**
 * Albertsons Scraper
 *
 * This pulls data from Albertsons's booking website. It runs on a JSON API, so
 * we leverage that here. However, there are some big caveats:
 * - It uses zip code + radius queries. The zip-codes module has a list of zips
 *   that can be queried in order to cover all the stores in a state.
 * - It only lists stores with availability. We look up a full list of all
 *   stores and mark the ones the API doesn't surface as unavailable.
 *   (The full list is from a one-off scrape of Albertsons websites -- see
 *   `scrape-albertsons-stores.js`.)
 * - You can request multiple vaccine types, but it's an AND, not OR query.
 *   Which means you have to issue a separate query for each vaccine type at
 *   each zip code. Instead, we currently just query for `COVID-19 Unknown` and
 *   assume every store with *some* kind of COVID vaccines will have that. :(
 * - The radius is variable but it's unclear where the cap on it is, or what
 *   the cap on number of results is. We've picked radii that seem to be safe
 *   relative to number of stores covered, but don't have a good way to know if
 *   a query has accidentally exceeded that. The biggest distance I've seen in
 *   test queries is ~75 miles, and biggest result set is > 110.
 */

const assert = require("node:assert/strict");
const Sentry = require("@sentry/node");
const { Available, LocationType, VaccineProduct } = require("../../model");
const {
  assertSchema,
  requireAllProperties,
} = require("../../schema-validation");
const {
  RateLimit,
  createWarningLogger,
  httpClient,
  unpadNumber,
} = require("../../utils");
const { HttpApiError } = require("../../exceptions");
const { BRANDS } = require("./common");
const {
  findKnownAlbertsonsByNumber,
  getAllKnownAlbertsons,
} = require("./locations");
const { zipCodesCoveringAlbertsons } = require("./zip-codes");

// You can also get slots from this URL, but we aren't using it for now:
// https://rxie.albertsons.com/abs/prod/rxie/appointment/slots
const API_URL =
  "https://rxie.albertsons.com/abs/prod/rxie/appointment/service-availability";

const BOOKING_URL = "https://www.albertsons.com/vaccinations/home";

// Service types used in Albertsons's booking sites, mapped to our vaccine
// products.
const SERVICE_TYPES = {
  "COVID-19 Unknown": null,
  "COVID-19 Pfizer": VaccineProduct.pfizerBa4Ba5,
  "COVID-19 Moderna": VaccineProduct.modernaBa4Ba5,
  "COVID-19 Novavax": VaccineProduct.novavax,
  "COVID-19 Dose 2 Pfizer": VaccineProduct.pfizerBa4Ba5,
  "COVID-19 Dose 2 Moderna": VaccineProduct,
  "COVID-19 Dose 2 Novavax": VaccineProduct.novavax,
  "COVID-19 Booster Dose Novavax": VaccineProduct.novavax,
  "COVID-19 Updated Booster Pfizer": VaccineProduct.pfizerBa4Ba5,
  "COVID-19 Updated Booster Moderna": VaccineProduct,
  "COVID-19 Additional Dose Pfizer": VaccineProduct.pfizerBa4Ba5,
  "COVID-19 Additional Dose Moderna": VaccineProduct,
  "COVID-19 Dose 1 Pfizer Child": VaccineProduct.pfizerBa4Ba5Age5_11,
  "COVID-19 Dose 1 Moderna Child": VaccineProduct.modernaBa4Ba5Age6_11,
  "COVID-19 Dose 2 Pfizer Child": VaccineProduct.pfizerBa4Ba5Age5_11,
  "COVID-19 Dose 2 Moderna Child": VaccineProduct.modernaBa4Ba5Age6_11,
  "COVID-19 Updated Booster Pfizer Child": VaccineProduct.pfizerBa4Ba5Age5_11,
  "COVID-19 Updated Booster Moderna Child": VaccineProduct.modernaBa4Ba5Age6_11,
  "COVID-19 Additional Dose Pfizer Child": VaccineProduct.pfizerBa4Ba5Age5_11,
  "COVID-19 Additional Dose Moderna Child": VaccineProduct.modernaBa4Ba5Age6_11,
};

const SUPPORTED_STATES = Object.keys(zipCodesCoveringAlbertsons);

const warn = createWarningLogger("albertsonsScraper");

class AlbertsonsScraperApiError extends HttpApiError {
  parse(response) {
    this.details = response.body;
    if (
      Array.isArray(response.body) &&
      response.body.every((e) => e.errorCode)
    ) {
      this.message = response.body
        .map((e) => `${e.errorMessage} (code ${e.errorCode})`)
        .join(", ");
    }
  }
}

async function queryZipCode(zip, radius = 50) {
  const response = await httpClient({
    url: API_URL,
    method: "POST",
    responseType: "json",
    headers: {
      correlationId: "1fd0cdf8-8a41-4c6c-8ff2-14c703445f55",
      version: "2",
      "ocp-apim-subscription-key": "b7bda12ac31a47b0a2bb3cad633d60c4",
    },
    json: {
      radius,
      dateOfBirth: "01/01/1980", // Needs something to be over the minimum
      serviceTypes: [
        { serviceTypeName: "COVID-19 Unknown", scientificName: "" },
      ],
      zip,
    },
    timeout: 60_000,
    throwHttpErrors: false,
    retry: { methods: ["POST"] },
  });

  // We expect to see an array of objects with a `store` property as the body.
  if (
    response.statusCode >= 400 ||
    !Array.isArray(response.body) ||
    !response.body.every((value) => value.store)
  ) {
    throw new AlbertsonsScraperApiError(response);
  }

  return response.body;
}

async function* queryState(state, rateLimit = null) {
  const zipCodeSets = zipCodesCoveringAlbertsons[state];
  if (!zipCodeSets) {
    throw new Error(`There are no known zip codes to query in "${state}"`);
  }

  // Since we are querying by zip + radius, we have to have overlapping queries
  // and will get a lot of repeat results across queries. Be careful to filter
  // those out.
  const seenStores = new Set();
  for (const radiusSet of zipCodeSets) {
    const radius = radiusSet.radius;
    for (const zipCode of radiusSet.zips) {
      if (rateLimit) await rateLimit.ready();

      const stores = await queryZipCode(zipCode, radius);

      for (const item of stores) {
        const storeNumber = item.store.currentStoreNumber;
        if (!seenStores.has(storeNumber) && item.store.state === state) {
          seenStores.add(storeNumber);
          yield item;
        }
      }
    }
  }
}

const numberStringType = { type: "string", minLength: 1, pattern: "^\\d+$" };
const hoursType = { type: "string", pattern: "(\\d+am - \\d+pm)|Closed" };

// API data for each location should look like this. The schema is fairly strict
// since we are pulling on an unversioned API designed for the web UI, and want
// the system to scream at us for any potentially impactful change.
const albertsonsLocationSchema = requireAllProperties({
  type: "object",
  properties: {
    store: requireAllProperties({
      type: "object",
      properties: {
        storeNumber: numberStringType,
        currentStoreNumber: numberStringType,
        // TODO: Identify all possible brand name values
        storeName: {
          enum: BRANDS.map((b) => b.bookingApiName).filter(Boolean),
        },
        storeDivision: { type: "string" },
        streetAddress: { type: "string" },
        streetAddress2: { type: "string", nullable: true },
        city: { type: "string" },
        state: { type: "string", pattern: "[A-Z]{2}" },
        zip: { type: "string", pattern: "\\d{1,5}" },
        longitude: { type: "number" },
        latitude: { type: "number" },
        distanceFromSearchPointMiles: { type: "number", minimum: 0 },
        telephone: { type: "string" },
        fax: { type: "string" },
        imageUrl: { type: "string" },
        mfHours: hoursType,
        satHours: hoursType,
        sunHours: hoursType,
        twentyfourHours: { type: "string", pattern: "true|false" },
        // NOTE: if this field starts getting real values instead of null, use
        // it to calculate capacity and/or slots.
        availableAppointments: { type: "null" },
        websiteUrl: { type: "string" },
        vcClientId: { type: "null" },
      },
      additionalProperties: false,
    }),
    serviceTypes: {
      type: "array",
      items: requireAllProperties({
        type: "object",
        properties: {
          serviceTypeName: { type: "string" },
        },
        additionalProperties: false,
      }),
    },
  },
  additionalProperties: false,
});

function formatLocation(apiData, checkedAt) {
  assertSchema(albertsonsLocationSchema, apiData);
  // In all cases we've seen, these are the same. We care because the saved
  // data we have for stores also has an "old" store number, and we want to
  // ensure we are matching my the correct IDs.
  assert.equal(
    apiData.store.storeNumber,
    apiData.store.currentStoreNumber,
    "The `storeNumber` and `currentStoreNumber` from the XHR API were different"
  );

  const storeData = findKnownAlbertsonsByNumber(
    apiData.store.currentStoreNumber
  );
  assert.ok(
    storeData,
    `Could not find known store with number ${apiData.store.currentStoreNumber}`
  );

  const products = apiData.serviceTypes
    .map((x) => {
      if (!(x.serviceType in SERVICE_TYPES)) {
        warn(`Unknown service type: ${x.serviceType}`);
        return null;
      }
      return SERVICE_TYPES[x.serviceType];
    })
    .filter(Boolean);

  return formatKnownStore(storeData, {
    meta: {
      albertsons_division: apiData.store.division,
      sunday_hours: apiData.store.sunHours,
      monday_hours: apiData.store.mfHours,
      tuesday_hours: apiData.store.mfHours,
      wednesday_hours: apiData.store.mfHours,
      thursday_hours: apiData.store.mfHours,
      friday_hours: apiData.store.mfHours,
      saturday_hours: apiData.store.satHours,
    },
    availability: {
      checked_at: checkedAt,
      available: Available.yes,
      products: products.length ? products : undefined,
    },
  });
}

function formatKnownStore(store, extra = null) {
  const storeNumber = unpadNumber(store.c_parentEntityID);

  // TODO: consider using c_geomodifier for the name. (We'd still need to
  // create a string with the store number for matching the brand, though.)
  const name = `${store.name} #${storeNumber}`;
  const storeBrand = BRANDS.find((item) => item.pattern.test(name));
  if (!storeBrand || storeBrand.key === "community_clinic") {
    // Unlike appointment data, we should *never* fail to match a brand to
    // data from our scraped, saved list of known pharmacy locations.
    throw new Error(`Failed to match a brand to known location "${name}"`);
  }

  let position;
  if (store.geocodedCoordinate) {
    position = {
      longitude: parseFloat(store.geocodedCoordinate.long),
      latitude: parseFloat(store.geocodedCoordinate.lat),
    };
  }

  return {
    name,
    external_ids: [
      [storeBrand.key, storeNumber],
      ["albertsons_store_number", `${storeBrand.key}:${storeNumber}`],
      ["albertsons_v2", storeNumber],
    ],
    provider: storeBrand.provider_id,
    location_type: storeBrand.locationType || LocationType.pharmacy,
    address_lines: [
      store.address.line1,
      store.address.line2,
      store.address.line3,
    ].filter(Boolean),
    city: store.address.city,
    state: store.address.region,
    postal_code: store.address.postalCode,
    position,

    info_phone: store.mainPhone?.display,
    info_url: store.c_pagesURL || storeBrand.url,
    booking_url: BOOKING_URL,
    description:
      store.c_metaInformation?.description ||
      store.covidVaccineSiteInstructions ||
      store.description,

    ...extra,

    meta: {
      timezone: store.timezone,
      albertsons_store_number: storeNumber,
      ...extra?.meta,
    },

    availability: {
      source: "univaf-albertsons-scraper",
      is_public: true,
      available: Available.no,
      ...extra?.availability,
    },
  };
}

/**
 * Get an array of stores from the given states that don't match the given
 * store numbers.
 * @param {Set<string>} matchedStoreNumbers
 * @param {string[]} states
 * @returns {any[]}
 */
function* listUnmatchedStores(matchedStoreNumbers, states) {
  for (const known of getAllKnownAlbertsons()) {
    if (
      states.includes(known.address.region) &&
      !matchedStoreNumbers.has(unpadNumber(known.c_parentEntityID))
    ) {
      yield known;
    }
  }
}

async function checkAvailability(
  handler,
  { states = SUPPORTED_STATES, rateLimit, verbose = false }
) {
  // Filter out unsupported states.
  states = states.filter((state) => {
    if (!SUPPORTED_STATES.includes(state)) {
      warn(`The state "${state}" is not supported.`);
      return false;
    }
    return true;
  });

  const rateLimiter = new RateLimit(rateLimit || 1);
  const checkedAt = new Date().toISOString();

  const results = [];
  const storeNumbers = new Set();
  for (const state of states) {
    for await (const apiLocation of queryState(state, rateLimiter)) {
      let location;
      Sentry.withScope((scope) => {
        scope.setContext("location", {
          id: apiLocation.storeNumber,
          source: "albertsonsScraper",
        });
        location = formatLocation(apiLocation, checkedAt);
      });
      handler(location);
      results.push(location);
      storeNumbers.add(location.meta.albertsons_store_number);
    }
  }

  // The web API only returns locations where appointments are available. Find
  // all other known locations and mark them as unavailable.
  const foundCount = results.length;
  let missingCount = 0;
  for (const missing of listUnmatchedStores(storeNumbers, states)) {
    missingCount++;
    Sentry.withScope((scope) => {
      scope.setContext("location", {
        id: missing.c_parentEntityID,
        source: "albertsonsScraper",
      });
      const location = formatKnownStore(missing, {
        availability: { checked_at: checkedAt },
      });
      handler(location);
      results.push(location);
    });
  }

  if (verbose) {
    console.warn(`Stores in API: ${foundCount}, missing: ${missingCount}`);
  }

  return results;
}

module.exports = {
  API_URL,
  checkAvailability,
};
