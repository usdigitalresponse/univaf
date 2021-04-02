/**
 * CVS appointment checker based based on their official API.
 * Docs: https://devportal-test.cvshealth.com/api/196
 *
 * This module uses two environment variables (one is *required*):
 * - CVS_API_KEY: (Required) An API key to authorize requests.
 * - CVS_API_URL: The base URL for CVS, which sets the environment. Defaults to
 *                the production environment.
 */

const got = require("got");
const { Available, LocationType } = require("../../model");
const { oneLine, warn } = require("../../utils");
const {
  CVS_CORPORATE_PHARMACY_PHONE_NUMBER,
  CVS_BOOKING_URL,
  getStoreCounty,
} = require("./shared");

const API_URL = "https://api.cvshealth.com/";
const AVAILABILITY_ENDPOINT = "/immunization-status/v1/covax-availability";

/**
 * @typedef {Object} CvsApiLocation
 * @property {number} storeId
 * @property {string} address
 * @property {string} zipCode
 * @property {string} city
 * @property {string} stateCode
 * @property {string} availabilityStatusDescription
 */
/**
 * @typedef {Object} CvsApiSuccess
 * @property {string} statusCode
 * @property {string} statusDescription
 * @property {string} lastUpdated
 * @property {Array<CvsApiLocation>} covaxAvailability
 * @example
 * {
 *   "statusCode": "0000",
 *   "statusDescription": "Success",
 *   "covaxAvailability": [
 *       {
 *           "storeId": 2196,
 *           "address": "701 COLLEGE DRIVE",
 *           "zipCode": "08012",
 *           "city": "BLACKWOOD",
 *           "stateCode": "NJ",
 *           "availabilityStatusDescription": "Fully Booked"
 *       }
 *   ],
 *   "lastUpdated": "2021-03-09T17:08:30.842Z"
 * }
 */

/**
 * Represent an error from the CVS API.
 * @property {Object} details Additional details about the error.
 */
class CvsApiError extends Error {
  /**
   * Create an error object for a bad response from CVS.
   * @param {http.IncomingMessage} response
   */
  constructor(response) {
    let message;
    let details;
    try {
      details = JSON.parse(response.body);
      message = `${details.statusCode} ${details.statusDescription}`;
    } catch (_) {
      details = { body: response.body };
      message = `${response.statusCode} ${response.statusMessage}`;
    }

    super(message);
    this.details = details;
  }
}

/**
 * Convert availability value from the API to our availability model.
 * @param {string} apiValue Availability field from the CVS API
 * @returns {availability}
 */
function toAvailable(apiValue) {
  let text = apiValue.toLowerCase();
  if (text === "available") return Available.yes;
  else if (text === "fully booked") return Available.no;
  else return Available.unknown;
}

/**
 * Convert a location entry from the CVS API to our data model.
 * @param {CvsApiLocation} location
 * @param {string} [lastUpdated]
 * @returns {Object}
 */
function parseApiLocation(location, lastUpdated) {
  const available = toAvailable(location.availabilityStatusDescription);
  if (available === Available.unknown) {
    warn(
      `Unexpected availability value for CVS store ${location.storeId}:`,
      location.availabilityStatusDescription
    );
  }

  const storeNumber = location.storeId.toString().padStart(5, "0");
  const name = `CVS #${location.storeId}`;

  const checkTime = new Date().toISOString();
  return {
    id: `CVS:${storeNumber}`,
    name,
    external_ids: { cvs: storeNumber },
    provider: "CVS",
    location_type: LocationType.pharmacy,

    address_lines: [location.address],
    city: location.city,
    state: location.stateCode,
    postal_code: location.zipCode,

    county: getStoreCounty(storeNumber),
    position: null,
    booking_phone: CVS_CORPORATE_PHARMACY_PHONE_NUMBER,
    booking_url: CVS_BOOKING_URL,

    availability: {
      source: "cvs-api",
      updated_at: lastUpdated || checkTime,
      checked_at: checkTime,
      available,
      is_public: false,
    },
  };
}

/**
 * Get availability data from the CVS API.
 * @param {string} [apiKey] CVS API key. Can also be provided via the
 *        CVS_API_KEY environment variable.
 * @param {string} [apiUrl] Base URL for the CVS API.
 */
async function checkAvailability(handler, _options) {
  let apiKey = process.env.CVS_API_KEY;
  let apiUrl = process.env.CVS_API_URL || API_URL;

  if (!apiKey) {
    throw new Error(oneLine`
      You must set a CVS API key via the CVS_API_KEY environment variable.
    `);
  }

  if (apiUrl.endsWith("/")) {
    apiUrl = apiUrl.slice(0, -1);
  }

  try {
    const body = await got({
      url: apiUrl + AVAILABILITY_ENDPOINT,
      searchParams: {
        // TODO: CLI options or something else should supply a list of states
        // that apply here instead of hardcoding NJ (and only NJ).
        stateCode: "NJ",
      },
      headers: {
        "x-api-key": apiKey,
      },
    }).json();

    return body.covaxAvailability.map((location) => {
      const record = parseApiLocation(location, body.lastUpdated);
      handler(record);
      return record;
    });
  } catch (error) {
    if (error instanceof got.HTTPError) {
      throw new CvsApiError(error.response);
    }
    throw error;
  }
}

module.exports = { checkAvailability, CvsApiError };
