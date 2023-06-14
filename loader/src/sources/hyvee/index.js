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
const { Logger } = require("../../logging");
const { queryGraphQl, DEFAULT_STATES } = require("../../utils");
const { LocationType, Available, VaccineProduct } = require("../../model");
const {
  assertSchema,
  requireAllProperties,
} = require("../../schema-validation");

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

const logger = new Logger("hyvee");

const locationSchema = requireAllProperties({
  type: "object",
  properties: {
    locationId: { type: "string" },
    name: { type: "string" },
    nickname: { type: "string", nullable: true },
    phoneNumber: { type: "string", pattern: "^\\+?1?\\d{10}$" },
    businessCode: { type: "string", pattern: "^\\d+$" },
    covidVaccineTimeSlotAndManufacturerAvailability: {
      type: "object",
      properties: {
        isCovidVaccineAvailable: { type: "boolean" },
        availableCovidVaccineManufacturers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              covidVaccineManufacturerId: { type: "string" },
              vaccineName: { type: "string" },
              doseTypes: { type: "array", items: { type: "string" } },
              isSingleDose: { type: "boolean" },
              __typename: { const: "CovidVaccineManufacturer" },
            },
          },
        },
        __typename: {
          const: "CovidVaccineTimeSlotAndManufacturerAvailability",
        },
      },
    },
    covidVaccineEligibilityTerms: { type: "string" },
    address: {
      type: "object",
      properties: {
        line1: { type: "string" },
        line2: { type: "string", nullable: true },
        city: { type: "string" },
        state: { type: "string", pattern: "^[A-Z]{2}$" },
        zip: { type: "string", pattern: "^\\d{5}$" },
        latitude: { type: "number" },
        longitude: { type: "number" },
        __typename: { const: "LocationAddress" },
      },
    },
    __typename: { const: "Location" },
  },
});

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
  const response = await queryGraphQl(API_URL, {
    // This API frequently returns GraphQL errors with "Internal Server Error".
    // We should try again in that case; it's equivalent to a 500 HTTP status.
    retryIf: (error) => /Internal Server Error/i.test(error.message),
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
  });

  const result = response.body?.data?.searchPharmaciesNearPoint;
  assert.ok(
    Array.isArray(result),
    `Response did not match expected format: ${JSON.stringify(response.body)}`
  );
  return result;
}

function formatLocation(data, checkedAt) {
  assertSchema(locationSchema, data);

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
        logger.warn(`Unknown product type "${product.vaccineName}"`);
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
          logger.warn(error);
        }
      });
      return formatted;
    })
    .filter((location) => states.includes(location.state));
}

async function* checkAvailability({ states = DEFAULT_STATES }) {
  const locations = await getData(states);
  yield* locations;
}

module.exports = {
  checkAvailability,
  fetchRawData,
  formatLocation,
};
