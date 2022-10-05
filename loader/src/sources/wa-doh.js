// Washington State DoH hosts data for multiple states for some providers where
// they have API access. (In practice, this is pretty much only Costco.)

const assert = require("node:assert/strict");
const { Available, LocationType } = require("../model");
const {
  httpClient,
  matchVaccineProduct,
  createWarningLogger,
  DEFAULT_STATES,
} = require("../utils");
const { assertValidGraphQl } = require("../exceptions");
const allStates = require("../states.json");

/** @typedef {import("../model").VaccineProduct} VaccineProduct */

const warn = createWarningLogger("waDoh");

// You can also navigate to this URL in a browser and get an interactive
// GraphQL testing console.
const API_URL = "https://apim-vaccs-prod.azure-api.net/open/graphql";
const LOCATIONS_QUERY = `
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
`;

// Known bad locations in WA DoH's data. We skip over these when loading data.
const INVALID_LOCATIONS = [
  "2255",
  "2755",
  "riteaid-5288",
  "prep-mod-3696ec0d-3869-4ff4-88ce-1030db1639ef",
];

/**
 *
 * @param {string} state 2-letter state abbreviation or state name to query
 * @yields {Promise<Object>}
 */
async function* queryState(state) {
  let pageNum = 1;
  const pageSize = 200;

  while (true) {
    const response = await httpClient({
      method: "POST",
      url: API_URL,
      responseType: "json",
      throwHttpErrors: false,
      json: {
        query: LOCATIONS_QUERY,
        variables: {
          searchInput: {
            state,
            paging: { pageNum, pageSize },
          },
        },
      },
    });
    assertValidGraphQl(response);

    const data = response.body?.data?.searchLocations;
    assert.ok(
      Array.isArray(data?.locations) && typeof data?.paging?.total === "number",
      `Response did not match expected format: ${JSON.stringify(response.body)}`
    );
    yield data.locations;

    if (data.paging.total <= pageNum * pageSize) break;

    pageNum++;
  }
}

/**
 * Convert availability value from the API to our availability model.
 * @param {string} apiValue Availability field from the API
 * @returns {Available}
 */
function toAvailable(apiValue) {
  const text = apiValue.toLowerCase();
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
  const text = (apiValue || "").toLowerCase();
  if (text === "clinic") return LocationType.clinic;
  else if (text === "pharmacy") return LocationType.pharmacy;
  else if (text === "store") return LocationType.pharmacy;

  warn(`Unknown location type "${apiValue}"`);
  return LocationType.pharmacy;
}

/**
 * Convert product name from the API to our names.
 * @param {string} apiValue
 * @returns {VaccineProduct}
 */
function toProduct(apiValue) {
  const product = matchVaccineProduct(apiValue);
  if (!product) {
    warn(`Unknown product type "${apiValue}"`);
  }
  return product;
}

/**
 * Convert a location entry from the API to our data model.
 * @param {Object} data
 * @returns {Object}
 */
function formatLocation(data) {
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
    warn(`Unable to determine provider for ${data.locationId}`);
  }

  const address_lines = [];
  if (data.addressLine1) address_lines.push(data.addressLine1);
  if (data.addressLine2) address_lines.push(data.addressLine2);

  const state = allStates.find(
    (state) => state.name === data.state || state.usps === data.state
  );
  if (!state) warn(`Unknown state "${data.state}"`);

  const external_ids = [["wa_doh", data.locationId]];

  // The API has IDs like `costco-293`, but the number is not a Costco ID or
  // store number (it appears to be an ID in appointment-plus). However,
  // the store contact e-mail DOES have the store number. :P
  if (provider === "costco") {
    const storeEmailMatch = data.email.match(/^w0*(\d+)phm@/i);
    if (storeEmailMatch) {
      external_ids.push(["costco", storeEmailMatch[1]]);
    } else {
      warn(`Unable to determine Costco store number for "${data.locationid}"`);
    }
  }

  if (data.schedulingLink.toLowerCase().includes("appointment-plus")) {
    const idMatch = data.locationId.match(/-0*(\d+)$/);
    if (idMatch) external_ids.push(["appointment_plus", idMatch[1]]);
  }

  const metaFields = [
    // Displayed as: "Accessible parking"
    "accessibleParking",
    // Displayed as: "Individuals needing additional support may have family or friends accompany them"
    "additionalSupports",
    // Communication cards are placards with symbols people can point to when
    // they have no language in common with site staff.
    // Displayed as: "Vaccine communication card available"
    "commCardAvailable",
    "commCardBrailleAvailable",
    // Displayed as: "Drive-up services"
    "driveupSite",
    // Displayed as: "Interpreters available"
    "interpretersAvailable",
    // List of supported languages as a string
    "interpretersDesc",
    // Displayed as: "Waiting area available"
    "waitingArea",
    // Displayed as: "Walk up services"
    "walkupSite",
    // Displayed as: "Wheelchair accessible"
    "wheelchairAccessible",
    // Displayed as: "Schedule online"
    "scheduleOnline",
    // Displayed as: "Schedule by phone"
    "scheduleByPhone",
    // Displayed as: "Schedule by email"
    "scheduleByEmail",
    // Displayed as: "Walk-ins accepted"
    "walkIn",
    // This is about waitlists being *available*, not required.
    // Displayed as: "Waitlist available"
    "waitList",
  ];
  const meta = {};
  for (const field of metaFields) {
    if (data[field] != null) meta[field] = data[field];
  }

  const checkTime = new Date().toISOString();
  return {
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
    meta,

    availability: {
      source: "univaf-wa-doh",
      valid_at: data.updatedAt,
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
async function checkAvailability(handler, { states = DEFAULT_STATES }) {
  // WA doesn't support some US territories.
  const unsupported = new Set(["AA", "AP", "AE"]);
  states = states.filter((state) => {
    if (unsupported.has(state)) {
      console.warn(`"${state}" is not supported for WA DoH.`);
      return false;
    }
    return true;
  });

  const results = [];
  for (const state of states) {
    for await (const page of queryState(state)) {
      for (const item of page) {
        // Skip known bad location entries.
        if (INVALID_LOCATIONS.includes(item.locationId)) continue;

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

        // Skip PrepMod -- we get these ourselves directly from PrepMod.
        if (item.rawDataSourceName === "PrepModVaccineAvailabilityFn") {
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

  if (!results.length) {
    warn("No locations were found. Something has probably gone wrong.");
  }

  return results;
}

module.exports = {
  API_URL,
  checkAvailability,
  formatLocation,
};
