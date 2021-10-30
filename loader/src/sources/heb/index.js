/**
 * Get official apointment data from Albertsons. This works via a file they
 * publish to S3 for appointment finders and other consumers like us, although
 * it does not appear to be officially documented anywhere. It could disappear
 * in the future without notice.
 *
 * Most of the logic and branding information here is based on an original
 * implementation by Nick Muerdter of VaccineSpotter.org (which has now been
 * shut down).
 * https://github.com/GUI/covid-vaccine-spotter/tree/main/src/providers
 */

const Sentry = require("@sentry/node");
const { DateTime } = require("luxon");
const { httpClient, parseUsAddress } = require("../../utils");
const { LocationType, VaccineProduct, Available } = require("../../model");
const { ParseError } = require("../../exceptions");

const API_URL =
  "https://s3-us-west-2.amazonaws.com/mhc.cdn.content/vaccineAvailability.json";

// Maps Albertsons product names to our product names.
const PRODUCT_NAMES = {
  pfizer: VaccineProduct.pfizer,
  moderna: VaccineProduct.moderna,
  jnj: VaccineProduct.janssen,
};

function formatLocation(data, checkedAt, validAt) {
  if (!checkedAt) checkedAt = new Date().toISOString();

  const external_ids = [
    // XXX: is this reliable for all entries?
    ["heb", data.storeNumber.toString()],
    // XXX: fix this!
    ["heb", "UHOH THE ABOVE DOESN'T MATCH VACCINESPOTTER"],
  ];

  return {
    name: data.name,
    external_ids,
    provider: "heb",
    location_type: LocationType.pharmacy,
    address_lines: [data.street],
    city: data.city,
    state: data.state,
    postal_code: data.zip,
    position: {
      longitude: data.longitude,
      latitude: data.latitude,
    },

    booking_url: data.url,

    availability: {
      source: "univaf-heb",
      valid_at: validAt,
      checked_at: checkedAt,
      is_public: true,
      available: "NOPE",
      available_count: data.openAppointmentSlots,
      products: ["NOPE"],
    },
  };
}

async function checkAvailability(handler, options) {
  let states = [];
  if (options.states) {
    states = options.states.split(",").map((state) => state.trim());
  }

  if (!states.length) {
    console.warn("No states specified for Albertsons");
    return [];
  }

  const stores = await getData(states);
  stores.forEach((store) => handler(store));
  return stores;
}

module.exports = {
  API_URL,
  checkAvailability,
  formatLocation,
};
