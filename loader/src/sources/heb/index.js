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
const {
  httpClient,
  createWarningLogger,
  DEFAULT_STATES,
} = require("../../utils");
const { LocationType, VaccineProduct, Available } = require("../../model");
const { assertSchema } = require("../../schema-validation");

const API_URL =
  "https://heb-ecom-covid-vaccine.hebdigital-prd.com/vaccine_locations.json";

// The way this works is a little funky. Locations list an array of
// `availableImmunizations`, which are strings, and map to the keys here.
// Locations also list slot groups, which each list a `manufacturer`.
// These objects join the values of those fields to our internal product types.
const IMMUNIZATION_TYPES = {
  Flu: {
    manufacturer: null,
    product: null,
  },
  Senior_Flu: {
    manufacturer: null,
    product: null,
  },
  "COVID-19 Pfizer": {
    manufacturer: "pfizer",
    product: VaccineProduct.pfizer,
  },
  "COVID-19 Pfizer_Updated_Booster": {
    manufacturer: "pfizer",
    product: VaccineProduct.pfizerBa4Ba5,
  },
  "COVID-19 Pediatric_Pfizer": {
    manufacturer: "pediatric_pfizer",
    product: VaccineProduct.pfizerAge5_11,
  },
  "COVID-19 Pediatric_Pfizer_Updated_Booster": {
    manufacturer: "pediatric_pfizer",
    product: VaccineProduct.pfizerBa4Ba5Age5_11,
  },
  "COVID-19 Ultra_Pediatric_Pfizer": {
    manufacturer: "ultra_pediatric_pfizer",
    product: VaccineProduct.pfizerAge0_4,
  },
  "COVID-19 Ultra_Pediatric_Pfizer_Updated_Booster": {
    manufacturer: "ultra_pediatric_pfizer",
    product: VaccineProduct.pfizerBa4Ba5Age0_4,
  },
  "COVID-19 Ultra_Pediatric_Pfizer_Updated_Dose3": {
    manufacturer: "ultra_pediatric_pfizer",
    product: VaccineProduct.pfizerBa4Ba5Age0_4,
  },
  "COVID-19 Moderna": {
    manufacturer: "moderna",
    product: VaccineProduct.moderna,
  },
  "COVID-19 Moderna_Updated_Booster": {
    manufacturer: "moderna",
    product: VaccineProduct.modernaBa4Ba5,
  },
  "COVID-19 Pediatric_Moderna": {
    manufacturer: "pediatric_moderna",
    product: VaccineProduct.modernaAge0_5,
  },
  "COVID-19 Pediatric_Moderna_Updated_Booster": {
    manufacturer: "pediatric_moderna",
    product: VaccineProduct.modernaBa4Ba5Age6_11,
  },
  "COVID-19 Ultra_Pediatric_Moderna_Updated_Booster": {
    manufacturer: "ultra_pediatric_moderna",
    product: VaccineProduct.modernaBa4Ba5Age0_5,
  },
  "COVID-19 Novavax": {
    // We haven't seen a "manufacturer" field with this, so it's a guess.
    manufacturer: "novavax",
    product: VaccineProduct.novavax,
  },
  "COVID-19 Janssen": {
    manufacturer: "janssen",
    product: VaccineProduct.janssen,
  },
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
    .filter((location) => states.includes(location?.state));
}

function formatAvailability(openSlots) {
  if (openSlots > 0) {
    return Available.yes;
  } else {
    return Available.no;
  }
}

/**
 * Given an array of slot detail objects and the immunizations available at a
 * location, produce an array of product types that are available.
 *
 * This is a little complex, some locations have an `availableImmunizations`
 * array of strings that identify the products on offer. Many (not all)
 * locations with open slots also have a `slotDetails` array of objects, where
 * each entry lists the available slot count for a given `manufacturer`. The
 * manufacturer isn't really a manufacturer, but just an older, slightly more
 * generic way of identifying the product (critically, it does not differ
 * between original and bivalent vaccines). If a variety of vaccines can be
 * given a slot, the manufacturer is "multiple". If the slots are for non-COVID
 * vaccines, the manufacturer is "other". If `availableImmunizations` is set,
 * this maps the manufacturer for each slot to the values in that list. If not,
 * this maps the manufacturer to the whole set of known values.
 *
 * @param {any[]} [slots]
 * @param {string[]} [availableImmunizations]
 * @returns {string[]}
 */
function formatAvailableProducts(slots, availableImmunizations) {
  if (!slots) return undefined;

  // Convert the location-level availableImmunizations field to a list of
  // objects with manufacturer and product code mappings.
  let availableTypes;
  if (availableImmunizations?.length) {
    availableTypes = availableImmunizations
      .map((key) => {
        if (!Object.hasOwn(IMMUNIZATION_TYPES, key)) {
          warn(`Unknown immunization type: ${key}`);
        } else if (IMMUNIZATION_TYPES[key].product) {
          return IMMUNIZATION_TYPES[key];
        }
      })
      .filter(Boolean);
  }

  const formatted = slots
    .flatMap((slot) => {
      const manufacturer = slot.manufacturer.toLowerCase();
      if (manufacturer === "other" || slot.openAppointmentSlots <= 0) {
        // "other" denotes non-COVID vaccines, like the flu.
        return [];
      } else if (manufacturer === "multiple") {
        return availableTypes?.map((type) => type.product) || [];
      } else {
        const types = availableTypes || Object.values(IMMUNIZATION_TYPES);
        const formatted = types
          .filter((type) => type.manufacturer === manufacturer)
          .map((type) => type.product);

        if (!formatted.length) {
          if (availableTypes) {
            warn(`No available products match manufacturer: "${manufacturer}"`);
          } else {
            warn(`Unknown manufacturer: "${manufacturer}"`);
          }
        }

        return formatted;
      }
    })
    .filter(Boolean);

  return formatted.length ? [...new Set(formatted)] : undefined;
}

// API data for each location should look like this. The schema is fairly strict
// since we are pulling on an unversioned API designed for the web UI, and want
// the system to scream at us for any potentially impactful change.
const hebLocationSchema = {
  type: "object",
  properties: {
    type: { enum: ["store"] },
    name: { type: "string" },
    storeNumber: { type: "integer", minimum: 1 },
    street: { type: "string" },
    city: { type: "string" },
    state: { type: "string", pattern: "[a-zA-Z]{2}" },
    zip: { type: "string", pattern: "\\d{1,5}" },
    longitude: { type: "number" },
    latitude: { type: "number" },
    url: {
      anyOf: [
        { type: "string", format: "url" },
        { type: "string", maxLength: 0, nullable: true },
      ],
    },
    fluUrl: {
      anyOf: [
        { type: "string", format: "url" },
        { type: "string", maxLength: 0, nullable: true },
      ],
    },
    openTimeslots: { type: "integer", minimum: 0 },
    openFluTimeslots: { type: "integer", minimum: 0 },
    openFluAppointmentSlots: { type: "integer", minimum: 0 },
    openAppointmentSlots: { type: "integer", minimum: 0 },
    slotDetails: {
      type: "array",
      items: {
        type: "object",
        properties: {
          openTimeslots: { type: "integer", minimum: 0 },
          openAppointmentSlots: { type: "integer", minimum: 0 },
          manufacturer: { type: "string" },
        },
        required: ["openTimeslots", "openAppointmentSlots"],
        additionalProperties: false,
      },
    },
    availableImmunizations: {
      type: "array",
      nullable: true,
      items: { type: "string", minLength: 1 },
    },
  },
  additionalProperties: false,
};
hebLocationSchema.required = Object.keys(hebLocationSchema.properties);

function formatLocation(data, checkedAt, validAt) {
  assertSchema(hebLocationSchema, data);
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
      products: formatAvailableProducts(
        data.slotDetails,
        data.availableImmunizations
      ),
    },
  };
}

function formatUrl(url) {
  return url ? url : "https://vaccine.heb.com/scheduler";
}

async function checkAvailability(handler, { states = DEFAULT_STATES }) {
  const stores = await getData(states);
  stores.forEach((store) => handler(store));
  return stores;
}

module.exports = {
  API_URL,
  checkAvailability,
  formatLocation,
};
