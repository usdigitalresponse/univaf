/**
 * Get official apointment data from H-E-B. This works via a file they
 * publish to their own website for appointment finders and other consumers like us, although
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
  "https://heb-ecom-covid-vaccine.hebdigital-prd.com/vaccine_locations.json";

// Maps H-E-B product names to our product names.
const PRODUCT_NAMES = {
  pfizer: VaccineProduct.pfizer,
  moderna: VaccineProduct.moderna,
  janssen: VaccineProduct.janssen,
};

function formatAvailability(openSlots) {
  if (openSlots > 0) {
    return Available.yes;
  } else {
    return Available.no;
  }
}

function formatAvailableProducts(raw) {
  if (!raw) return undefined;
  
  return raw
  .map((value) => {
    const formatted = PRODUCT_NAMES[value.manufacturer.toLowerCase()];
    if (!formatted) {
      warn(`Unknown 'drugName' value: ${value}`);
    }
    return formatted;
  })
  .filter(Boolean);
}

function formatLocation(data, checkedAt, validAt) {
  if (!checkedAt) checkedAt = new Date().toISOString();

  const external_ids = [
    // NOTE: this is not reliable for all entries
    // Should we use the address or booking url 
    // as another external id?
    ["heb", data.storeNumber.toString()]
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
//    valid_at: validAt,
      checked_at: checkedAt,
      is_public: true,
      available: formatAvailability(data.openAppointmentSlots),
      available_count: data.openAppointmentSlots,
      products: formatAvailableProducts(data.slotDetails),
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
