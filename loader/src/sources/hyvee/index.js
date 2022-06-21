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

const Sentry = require("@sentry/node");
const { httpClient } = require("../../utils");
const { LocationType, Available, VaccineProduct } = require("../../model");

const API_URL = "https://www.hy-vee.com/my-pharmacy/api/graphql";
const BOOKING_URL = "https://www.hy-vee.com/my-pharmacy/covid-vaccine-consent";
const SOURCE_NAME = "univaf-hyvee";
const PROVIDER_NAME = "hyvee";
const VACCINE_NAMES = {
  Moderna: VaccineProduct.moderna,
  "Pediatric-Moderna (3-5)": VaccineProduct.modernaAge0_5,
  "Pfizer-BioNTech": VaccineProduct.pfizer,
  "Pediatric-Pfizer (5-11)": VaccineProduct.pfizerAge5_11,
  Janssen: VaccineProduct.janssen,
};

function warn(message, context) {
  console.warn(`HyVee: ${message}`, context);
  // Sentry does better fingerprinting with an actual exception object.
  if (message instanceof Error) {
    Sentry.captureException(message, { level: Sentry.Severity.Info });
  } else {
    Sentry.captureMessage(message, Sentry.Severity.Info);
  }
}

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
    timeout: 30000,
    retry: 0,
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
                  manufacturerName
                  isSingleDose
                  isBooster
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

  return response.body.data.searchPharmaciesNearPoint;
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
    .filter((product) => product.manufacturerName !== "Flu Vaccine")
    .map((product) => {
      const result = VACCINE_NAMES[product.manufacturerName];
      if (!result) {
        warn(`Unknown product type "${product.manufacturerName}"`);
      }
      return result;
    });

  return products.length ? products : undefined;
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

async function checkAvailability(handler, options) {
  let states = [];
  if (options.states) {
    states = options.states.split(",").map((state) => state.trim());
  }

  if (!states.length) {
    console.warn("No states specified for HyVee");
    return [];
  }

  const locations = await getData(states);
  locations.forEach((location) => handler(location));
  return locations;
}

module.exports = {
  checkAvailability,
  fetchRawData,
  formatLocation,
};
