// Washington State DoH hosts data for multiple states for some providers where
// they have API access.

const got = require("got");
const { Available, LocationType, VaccineProduct } = require("../model");
const { warn } = require("../utils");
const { HttpApiError } = require("../exceptions");
// XXX: Need to find an acceptable way to handle this
const allStates = require("../../../ui/src/states.json");

const API_URL = "https://apim-vaccs-prod.azure-api.net/open/graphql";

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
                  county
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
                  accessibleParking
                  additionalSupports
                  commCardAvailable
                  commCardBrailleAvailable
                  driveupSite
                  interpretersAvailable
                  interpretersDesc
                  supportUrl
                  waitingArea
                  walkupSite
                  wheelchairAccessible
                  scheduleOnline
                  scheduleByPhone
                  scheduleByEmail
                  walkIn
                  waitList
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
  let text = (apiValue || "").toLowerCase();
  if (text === "clinic") return LocationType.clinic;
  else if (text === "pharmacy") return LocationType.pharmacy;
  else if (text === "store") return LocationType.pharmacy;

  console.error(`WA DoH: Unknown location type "${apiValue}"`);
  return LocationType.pharmacy;
}

/**
 * Convert product name from the API to our names.
 * @param {string} apiValue
 * @returns {VaccineProduct}
 */
function toProduct(apiValue) {
  let text = apiValue.toLowerCase();
  if (text === "pfizer-biontech") return VaccineProduct.pfizer;
  else if (text === "moderna") return VaccineProduct.moderna;
  else if (text.includes("johnson & johnson")) return VaccineProduct.janssen;

  console.error(`WA DoH: Unknown product type "${apiValue}"`);
  return null;
}

/**
 * Convert a location entry from the API to our data model.
 * @param {Object} data
 * @returns {Object}
 */
function formatLocation(data) {
  // Skip some seemingly bad location entries.
  if (["2255", "2755", "riteaid-5288"].includes(data.locationId)) return;

  let provider = data.providerName;
  if (
    !provider &&
    ((data.locationName || "").toLowerCase().includes("costco") ||
      data.rawDataSourceName === "CostcoVaccineAvailabilityFn" ||
      data.rawDataSourceName === "CostcoLocationsFn")
  ) {
    provider = "costco";
  }
  if (!provider) {
    warn(`WA DoH: Unable to determine provider for ${data.locationId}`);
  }

  const address_lines = [];
  if (data.addressLine1) address_lines.push(data.addressLine1);
  if (data.addressLine2) address_lines.push(data.addressLine2);

  const state = allStates.find(
    (state) => state.name === data.state || state.usps === data.state
  );
  if (!state) console.error(`WA DoH: Unknown state "${data.state}"`);

  const external_ids = { wa_doh: data.locationId };

  // The API has IDs like `costco-293`, but the number is not a Costco ID or
  // store number (it appears to be an ID in appointment-plus). However,
  // the store contact e-mail DOES have the store number. :P
  if (provider === "costco") {
    const storeEmailMatch = data.email.match(/^w0*(\d+)phm@/i);
    if (storeEmailMatch) {
      external_ids.costco = storeEmailMatch[1];
    } else {
      console.error(
        `WA DoH: Unable to determine Costco store number for "${data.locationid}"`
      );
    }
  }

  if (data.schedulingLink.toLowerCase().includes("appointment-plus")) {
    const idMatch = data.locationId.match(/-0*(\d+)$/);
    if (idMatch) external_ids.appointment_plus = idMatch[1];
  }

  const checkTime = new Date().toISOString();
  return {
    id: data.locationId,
    name: data.locationName,
    external_ids,
    provider,
    location_type: toLocationType(data.locationType),

    address_lines,
    city: data.city,
    state: state?.usps,
    postal_code: data.zipcode,
    county: data.county || undefined,

    position: { latitude: data.latitude, longitude: data.longitude },
    booking_phone: data.phone,
    booking_url: data.schedulingLink,
    info_url: data.infoLink || undefined,
    description: `${data.description}\n\n${data.directions}`.trim(),

    meta: {
      // Displayed as: "Accessible parking"
      accessibleParking: data?.accessibleParking ?? undefined,
      // Displayed as: "Individuals needing additional support may have family or friends accompany them"
      additionalSupports: data?.additionalSupports ?? undefined,
      // Communication cards are placards with symbols people can point to when
      // they have no language in common with site staff.
      // Displayed as: "Vaccine communication card available"
      commCardAvailable: data?.commCardAvailable ?? undefined,
      commCardBrailleAvailable: data?.commCardBrailleAvailable ?? undefined,
      // Displayed as: "Drive-up services"
      driveupSite: data?.driveupSite ?? undefined,
      // Displayed as: "Interpreters available"
      interpretersAvailable: data?.interpretersAvailable ?? undefined,
      // List of supported languages as a string
      interpretersDesc: data?.interpretersDesc ?? undefined,
      // Displayed as: "Waiting area available"
      waitingArea: data?.waitingArea ?? undefined,
      // Displayed as: "Walk up services"
      walkupSite: data?.walkupSite ?? undefined,
      // Displayed as: "Wheelchair accessible"
      wheelchairAccessible: data?.wheelchairAccessible ?? undefined,
      // Displayed as: "Schedule online"
      scheduleOnline: data?.scheduleOnline ?? undefined,
      // Displayed as: "Schedule by phone"
      scheduleByPhone: data?.scheduleByPhone ?? undefined,
      // Displayed as: "Schedule by email"
      scheduleByEmail: data?.scheduleByEmail ?? undefined,
      // Displayed as: "Walk-ins accepted"
      walkIn: data?.walkIn ?? undefined,
      // This is about waitlists being *available*, not required.
      // Displayed as: "Waitlist available"
      waitList: data?.waitList ?? undefined,
    },

    availability: {
      source: "univaf-wa-doh",
      updated_at: data.updatedAt,
      checked_at: checkTime,
      available: toAvailable(data.vaccineAvailability),
      products:
        data.vaccineTypes && data.vaccineTypes.map(toProduct).filter(Boolean),
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
