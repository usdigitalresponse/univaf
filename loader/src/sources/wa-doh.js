// Washington State DoH hosts data for multiple states for some providers where
// they have API access.

const got = require("got");
const { Available, LocationType } = require("../model");
const { warn } = require("../utils");
const { HttpApiError } = require("../exceptions");
// XXX: Need to find an acceptable way to handle this
const allStates = require("../../../ui/src/states.json");

const API_URL = "https://apim-vaccs-prod.azure-api.net/graphql";

class WaDohApiError extends HttpApiError {
  parse(response) {
    if (typeof response.body === "object") {
      this.details = response.body;
    } else {
      this.details = JSON.parse(response.body);
    }
    this.message = this.details.errors.map((item) => item.message).join(", ");
  }
}

/**
 *
 * @param {string} state 2-letter state abbreviation or state name to query
 * @yields {Promise<Object>}
 */
async function* queryState(state) {
  let pageNum = 1;
  let pageSize = 100;

  try {
    while (true) {
      const body = await got({
        method: "POST",
        url: API_URL,
        json: {
          query: `
            query SearchLocations($searchInput: SearchLocationsInput) {
              searchLocations(searchInput: $searchInput) {
                paging { pageSize pageNum total }
                locations {
                  locationId
                  locationName
                  locationType
                  providerId
                  providerName
                  departmentId
                  departmentName
                  addressLine1
                  addressLine2
                  city
                  state
                  zipcode
                  latitude
                  longitude
                  description
                  contactFirstName
                  contactLastName
                  fax
                  phone
                  email
                  schedulingLink
                  vaccineAvailability
                  vaccineTypes
                  infoLink
                  timeZoneId
                  directions
                  updatedAt
                  rawDataSourceName
                  __typename
                }
              }
            }
          `,
          variables: {
            searchInput: {
              state,
              paging: { pageNum, pageSize },
            },
          },
        },
      }).json();
      if (body.errors) throw new WaDohApiError({ body });

      yield body.data.searchLocations.locations;
      if (body.data.searchLocations.paging.total <= pageNum * pageSize) break;

      pageNum++;
    }
  } catch (error) {
    if (error instanceof got.HTTPError) {
      throw new WaDohApiError(error.response);
    }
    throw error;
  }
}

/**
 * Convert availability value from the API to our availability model.
 * @param {string} apiValue Availability field from the API
 * @returns {Available}
 */
function toAvailable(apiValue) {
  let text = apiValue.toLowerCase();
  if (text === "available") return Available.yes;
  else if (text === "unavailable") return Available.no;
  else return Available.unknown;
}

/**
 * Convert location type value from the API to our location model.
 * @param {string} apiValue LocationType field from the CVS API
 * @returns {LocationType}
 */
function toLocationType(apiValue) {
  let text = apiValue.toLowerCase();
  if (text === "clinic") return LocationType.clinic;
  else if (text === "pharmacy") return LocationType.pharmacy;
  else if (text === "store") return LocationType.pharmacy;

  console.error(`WA DoH: Unknown location type "${apiValue}"`);
  return LocationType.pharmacy;
}

/**
 * Convert a location entry from the API to our data model.
 * @param {Object} data
 * @returns {Object}
 */
function formatLocation(data) {
  let provider = data.providerName;
  if (!provider && (data.locationName || "").toLowerCase().includes("costco")) {
    provider = "Costco";
  }
  if (!provider) {
    warn(`WA DoH: Unable to determine provider for ${data.locationId}`);
  }

  const address_lines = [];
  if (data.addressLine1) address_lines.push(data.addressLine1);
  if (data.addressLine2) address_lines.push(data.addressLine2);

  const state = allStates.find((state) => state.name === data.state);
  if (!state) console.error(`WA DoH: Unknown state "${data.state}"`);

  const checkTime = new Date().toISOString();
  return {
    id: data.locationId,
    name: data.locationName,
    // The API doesn't seem to currently surface store numbers, so just declare
    // this to be a Washington DoH ID.
    external_ids: { wa_doh: data.locationId },
    provider,
    location_type: toLocationType(data.locationType),

    address_lines,
    city: data.city,
    state: state?.usps,
    postal_code: data.zipcode,

    position: { latitude: data.latitude, longitude: data.longitude },
    booking_phone: data.phone,
    booking_url: data.schedulingLink,
    description: `${data.description}\n\n${data.directions}`.trim(),

    availability: {
      source: "wa-doh",
      updated_at: data.updatedAt,
      checked_at: checkTime,
      available: toAvailable(data.vaccineAvailability),
      is_public: true,
    },
  };
}

/**
 * Get availability data from the WA Department of Health API.
 */
async function checkAvailability(handler, options) {
  let states = [];
  if (options.waDohStates) {
    states = options.waDohStates.split(",").map((state) => state.trim());
  } else if (options.states) {
    states = options.states.split(",").map((state) => state.trim());
  }
  if (states[0] === "all") {
    // WA doesn't support some US territories.
    const unsupported = new Set(["AA", "AP", "AE"]);
    states = allStates
      .map((state) => state.usps)
      .filter((code) => code && !unsupported.has(code));
  }

  if (!states.length) console.error("No states specified for WA DoH");

  let results = [];
  for (const state of states) {
    for await (let page of queryState(state)) {
      for (let item of page) {
        // Skip non-Costco data from WA for now. (We will probably want to
        // turn this back on eventually.)
        // WA publishes fairly comprehensive data within the state, but at the
        // moment we're only interested in the sources they publish nationwide
        // data for.
        if (
          state === "WA" &&
          item.rawDataSourceName !== "CostcoLocationsFn" &&
          item.rawDataSourceName !== "CostcoVaccineAvailabilityFn"
        ) {
          continue;
        }

        const location = formatLocation(item);
        if (location) {
          results.push(location);
          handler(location);
        }
      }
    }
  }

  return results;
}

module.exports = { checkAvailability, WaDohApiError };
