/**
 * HyVee Co-op Grocery
 *
 * This uses the same GraphQL API that the HyVee's website uses for booking. It
 * gets us structured data, but isn't a public API and could change without
 * notice. Booking site: https://www.hy-vee.com/my-pharmacy/vaccine-consent
 *
 * This fills in:
 * - `available`
 * - `products`
 *
 * Getting specific appointment slot info and dose info appears possible, but
 * requires making a query for every location/product combination, which is
 * not worthwhile at the moment.
 */

const assert = require("node:assert/strict");
const Sentry = require("@sentry/node");
const {
  httpClient,
  createWarningLogger,
  DEFAULT_STATES,
} = require("../../utils");
const { LocationType, Available, VaccineProduct } = require("../../model");
const { assertValidGraphQl } = require("../../exceptions");

const API_URL = "https://www.hy-vee.com/my-pharmacy/api/graphql";
const BOOKING_URL = "https://www.hy-vee.com/my-pharmacy/covid-vaccine-consent";
const SOURCE_NAME = "univaf-hyvee";
const PROVIDER_NAME = "hyvee";
const VACCINE_NAMES = {
  Moderna: VaccineProduct.moderna,
  "Moderna Bivalent": VaccineProduct.modernaBa4Ba5,
  // Moderna 12-17 is the same product as 12+ or 18+. This is a little messy,
  // since technically these might be separate appointment slots for teens.
  "Moderna (12-17)": VaccineProduct.moderna,
  "Pediatric Moderna Bivalent (6-12)": VaccineProduct.modernaBa4Ba5Age6_11,
  "Pediatric-Moderna (3-5)": VaccineProduct.modernaAge0_5,
  "Pediatric Moderna Bivalent 3-5": VaccineProduct.modernaBa4Ba5Age0_5,
  "Pediatric Moderna Bivalent (3-5)": VaccineProduct.modernaBa4Ba5Age0_5,
  "Pfizer-BioNTech": VaccineProduct.pfizer,
  "Pfizer Bivalent": VaccineProduct.pfizerBa4Ba5,
  "Pediatric-Pfizer (5-11)": VaccineProduct.pfizerAge5_11,
  "Pediatric Pfizer Bivalent (5-11)": VaccineProduct.pfizerBa4Ba5Age5_11,
  "Pediatric-Pfizer (under 5)": VaccineProduct.pfizerAge0_4,
  "Pediatric-Pfizer Bivalent (under 5)": VaccineProduct.pfizerBa4Ba5Age0_4,
  "Pediatric Pfizer Bivalent 3-4": VaccineProduct.pfizerBa4Ba5Age0_4,
  Janssen: VaccineProduct.janssen,
  Novavax: VaccineProduct.novavax,
};

const warn = createWarningLogger("hyvee");

/**
 * Get an array of raw store & covid availability records from the HyVee API.
 * This isn't a public API with any special support; we're just hitting the
 * GraphQL endpoints the their appointment booker web pages do, so it could
 * change.
 * Visit https://www.hy-vee.com/my-pharmacy/vaccine-consent and monitor the
 * network requests it makes to find the most up-to-date query to use here.
 * @returns {Promise<any[]>}
 */
async function fetchRawData() {
  const response = await httpClient(API_URL, {
    method: "POST",
    responseType: "json",
    timeout: 60_000,
    // POST does not get retried by default.
    retry: { methods: ["POST"] },
    json: {
      operationName: "SearchPharmaciesNearPointWithCovidVaccineAvailability",
      variables: {
        radius: 5000,
        latitude: 39.8283,
        longitude: -98.5795,
      },
      query: `
        query SearchPharmaciesNearPointWithCovidVaccineAvailability($latitude: Float!, $longitude: Float!, $radius: Int! = 10) {
          searchPharmaciesNearPoint(latitude: $latitude, longitude: $longitude, radius: $radius) {
            distance
            location {
              locationId
              name
              nickname
              phoneNumber
              businessCode
              covidVaccineTimeSlotAndManufacturerAvailability {
                isCovidVaccineAvailable
                availableCovidVaccineManufacturers {
                  covidVaccineManufacturerId
                  vaccineName
                  doseTypes
                  isSingleDose
                  __typename
                }
                __typename
              }
              covidVaccineEligibilityTerms
              address {
                line1
                line2
                city
                state
                zip
                latitude
                longitude
                __typename
              }
              __typename
            }
            __typename
          }
        }
      `,
    },
  });

  assertValidGraphQl(response);

  const result = response.body?.data?.searchPharmaciesNearPoint;
  assert.ok(
    Array.isArray(result),
    `Response did not match expected format: ${JSON.stringify(response.body)}`
  );
  return result;
}

function formatLocation(data, checkedAt) {
  const address_lines = [data.address.line1];
  if (data.address.line2) {
    address_lines.push(data.address.line2);
  }

  // covidVaccineEligibilityTerms may sometimes have useful info, but is often
  // 'No eligibility terms defined.'
  let description;
  if (
    data.covidVaccineEligibilityTerms &&
    !/no eligibility terms/i.test(data.covidVaccineEligibilityTerms)
  ) {
    description = data.covidVaccineEligibilityTerms;
  }

  return {
    // Store names in this data don't clarify that we are talking about HyVee.
    // e.g. "Waterloo #2" is the name of the second store in Waterloo, IA.
    name: `HyVee ${data.name}`,
    external_ids: [
      ["hyvee", data.locationId],
      ["hyvee_store", data.businessCode.toString()],
    ],
    provider: PROVIDER_NAME,
    location_type: LocationType.pharmacy,
    address_lines,
    city: data.address.city,
    state: data.address.state,
    postal_code: data.address.zip,
    position: {
      longitude: data.address.longitude,
      latitude: data.address.latitude,
    },

    info_phone: data.phoneNumber || undefined,
    booking_url: BOOKING_URL,
    description,
    meta: { hyvee_nickname: data.nickname || undefined },

    availability: {
      source: SOURCE_NAME,
      checked_at: checkedAt,
      available: data.covidVaccineTimeSlotAndManufacturerAvailability
        .isCovidVaccineAvailable
        ? Available.yes
        : Available.no,
      products: formatProducts(
        data.covidVaccineTimeSlotAndManufacturerAvailability
      ),
    },
  };
}

function formatProducts(vaccineData) {
  const products = vaccineData.availableCovidVaccineManufacturers
    .filter((product) => product.vaccineName !== "Flu Vaccine")
    .map((product) => {
      const result = VACCINE_NAMES[product.vaccineName];
      if (!result) {
        warn(`Unknown product type "${product.vaccineName}"`);
      }
      return result;
    });

  return products.length ? [...new Set(products)] : undefined;
}

async function getData(states) {
  const rawLocations = await fetchRawData();
  const checkedAt = new Date().toISOString();
  return rawLocations
    .map((entry) => {
      let formatted;
      Sentry.withScope((scope) => {
        scope.setContext("location", {
          id: entry.location.locationId,
          provider: "hyvee",
        });
        try {
          formatted = formatLocation(entry.location, checkedAt);
        } catch (error) {
          warn(error);
        }
      });
      return formatted;
    })
    .filter((location) => states.includes(location.state));
}

async function checkAvailability(handler, { states = DEFAULT_STATES }) {
  const locations = await getData(states);
  locations.forEach((location) => handler(location));
  return locations;
}

module.exports = {
  checkAvailability,
  fetchRawData,
  formatLocation,
};
