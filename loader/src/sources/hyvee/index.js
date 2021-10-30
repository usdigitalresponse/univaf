const Sentry = require("@sentry/node");
const { httpClient } = require("../../utils");
const { LocationType, VaccineProduct, Available } = require("../../model");
const { ParseError } = require("../../exceptions");

const API_URL = "https://www.hy-vee.com/my-pharmacy/api/graphql";
const BOOKING_URL = "https://www.hy-vee.com/my-pharmacy/covid-vaccine-consent";

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
  // implement me!

  // covidVaccineEligibilityTerms usually is 'No eligibility terms defined.'
  // Manufacturers: Set(4) { 'Pfizer-BioNTech', 'Flu Vaccine', 'Moderna', 'Janssen' }

  const address_lines = [data.address.line1];
  if (data.address.line2) {
    address_lines.push(data.address.line2);
  }

  return {
    // Store names in this data don't clarify that we are talking about HyVee.
    name: `HyVee ${data.name}`,
    external_ids: [
      ["hyvee", data.locationId],
      ["hyvee_store", data.businessCode.toString()],
    ],
    provider: "hyvee",
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
    meta: { hyvee_nickname: data.nickname },
    is_public: true,

    availability: {
      source: "univaf-hyvee",
      checked_at: checkedAt,
      is_public: true,
      available: data.covidVaccineTimeSlotAndManufacturerAvailability
        .isCovidVaccineAvailable
        ? Available.yes
        : Available.no,
      products: ["NOPE"],
    },
  };
}

module.exports = {
  fetchRawData,
  formatLocation,
};
