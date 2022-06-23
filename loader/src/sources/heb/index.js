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
const { httpClient, createWarningLogger } = require("../../utils");
const { LocationType, VaccineProduct, Available } = require("../../model");

const API_URL =
  "https://heb-ecom-covid-vaccine.hebdigital-prd.com/vaccine_locations.json";

// Maps H-E-B product names to our product names.
const PRODUCT_NAMES = {
  pfizer: VaccineProduct.pfizer,
  moderna: VaccineProduct.moderna,
  // NOTE: the naming progression for Moderna is different than Pfizer.
  pediatric_moderna: VaccineProduct.modernaAge0_5,
  janssen: VaccineProduct.janssen,
  pediatric_pfizer: VaccineProduct.pfizerAge5_11,
  ultra_pediatric_pfizer: VaccineProduct.pfizerAge0_4,
};

const warn = createWarningLogger("heb");

async function fetchRawData() {
  const response = await httpClient(API_URL, {
    // Bust caches with a random querystring.
    searchParams: { v: Math.random() * 999999999999 },
    responseType: "json",
    timeout: 30000,
  });

  const lastModified = response.headers["last-modified"];

  return {
    validAt: lastModified
      ? DateTime.fromHTTP(lastModified, { zone: "utc" }).toISO()
      : undefined,
    data: response.body,
  };
}

/**
 * H-E-B has several locations missing a store number.
 * Not including those locations in results, or locations
 * with no open appointment slots.
 */
async function getData(states) {
  const { validAt, data } = await fetchRawData();
  const checkedAt = new Date().toISOString();

  return data.locations
    .filter((location) => Boolean(location.storeNumber))
    .map((entry) => {
      let formatted;
      Sentry.withScope((scope) => {
        scope.setContext("location", {
          id: entry.storeNumber,
          provider: "heb",
        });
        try {
          formatted = formatLocation(entry, validAt, checkedAt);
        } catch (error) {
          warn(error);
        }
      });
      return formatted;
    })
    .filter((location) => states.includes(location.state));
}

function formatAvailability(openSlots) {
  if (openSlots > 0) {
    return Available.yes;
  } else {
    return Available.no;
  }
}

/**
 * H-E-B includes "other" products in their list
 * of available vaccine types. Likely a flu vaccine /
 * not relevant for covid vaccine scheduling.
 */
function formatAvailableProducts(raw) {
  if (!raw) return undefined;

  const formatted = raw
    .map((value) => {
      const productType = value.manufacturer.toLowerCase();
      const formatted = PRODUCT_NAMES[productType];
      if (productType != "other" && !formatted) {
        warn(`Unknown product type`, value.manufacturer, true);
      }
      if (value.openAppointmentSlots > 0) {
        return formatted;
      }
    })
    .filter(Boolean);

  return formatted.length ? formatted : undefined;
}

function formatLocation(data, checkedAt, validAt) {
  if (!checkedAt) checkedAt = new Date().toISOString();

  const external_ids = [["heb", `${data.storeNumber}`]];

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

    booking_url: formatUrl(data.url),

    availability: {
      source: "univaf-heb",
      valid_at: validAt,
      checked_at: checkedAt,
      is_public: true,
      available: formatAvailability(data.openAppointmentSlots),
      available_count: data.openAppointmentSlots,
      products: formatAvailableProducts(data.slotDetails),
    },
  };
}

function formatUrl(url) {
  return url ? url : "https://vaccine.heb.com/scheduler";
}

async function checkAvailability(handler, options) {
  let states = [];
  if (options.states) {
    states = options.states.split(",").map((state) => state.trim());
  }

  if (!states.length) {
    console.warn("No states specified for H-E-B");
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
