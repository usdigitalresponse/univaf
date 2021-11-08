const Sentry = require("@sentry/node");
const { httpClient, matchVaccineProduct } = require("../../utils");
const { LocationType, Available } = require("../../model");

const API_URL = "https://www.hy-vee.com/my-pharmacy/api/graphql";
const BOOKING_URL = "https://www.hy-vee.com/my-pharmacy/covid-vaccine-consent";
const SOURCE_NAME = "univaf-hyvee";
const PROVIDER_NAME = "hyvee";

function warn(message, context) {
  console.warn(`HyVee: ${message}`, context);
  // Sentry does better fingerprinting with an actual exception object.
  if (message instanceof Error) {
    Sentry.captureException(message, { level: Sentry.Severity.Info });
  } else {
    Sentry.captureMessage(message, Sentry.Severity.Info);
  }
}

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

    info_phone: data.phoneNumber,
    booking_url: BOOKING_URL,
    description,
    meta: { hyvee_nickname: data.nickname },

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
  return vaccineData.availableCovidVaccineManufacturers
    .filter((product) => product.manufacturerName !== "Flu Vaccine")
    .map((product) => {
      const result = matchVaccineProduct(product.manufacturerName);
      if (!result) {
        warn(`Unknown product type "${product.manufacturerName}"`);
      }
      return result;
    });
}

module.exports = {
  fetchRawData,
  formatLocation,
};
