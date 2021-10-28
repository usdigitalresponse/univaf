const Sentry = require("@sentry/node");
const { DateTime } = require("luxon");
const { HttpApiError } = require("../../exceptions");
const { httpClient } = require("../../utils");
const { LocationType, VaccineProduct, Available } = require("../../model");

const API_URL =
  "https://s3-us-west-2.amazonaws.com/mhc.cdn.content/vaccineAvailability.json";

// Maps Albertsons product names to our product names.
const PRODUCT_NAMES = {
  pfizer: VaccineProduct.pfizer,
  moderna: VaccineProduct.moderna,
  jnj: VaccineProduct.janssen,
};

const BASE_BRAND = {
  provider_id: "albertsons",
  key: "albertsons",
  name: "Albertsons",
  url: "https://www.albertsons.com/pharmacy/covid-19.html",
};

const BRANDS = [
  {
    ...BASE_BRAND,
    key: "acme",
    name: "Acme",
    pattern: /Acme/i,
  },
  {
    ...BASE_BRAND,
    key: "albertsons_market",
    name: "Albertsons Market",
    pattern: /Albertsons Market/i,
  },
  {
    ...BASE_BRAND,
    key: "albertsons",
    name: "Albertsons",
    pattern: /Albertsons/i,
  },
  {
    ...BASE_BRAND,
    key: "amigos",
    name: "Amigos",
    pattern: /Amigos/i,
  },
  {
    ...BASE_BRAND,
    key: "carrs",
    name: "Carrs",
    pattern: /Carrs/i,
  },
  {
    ...BASE_BRAND,
    key: "haggen",
    name: "Haggen",
    url: "https://www.haggen.com/explore-our-departments/pharmacy/covid-19/",
    pattern: /Haggen/i,
  },
  {
    ...BASE_BRAND,
    key: "jewelosco",
    name: "Jewel-Osco",
    pattern: /Jewel.Osco/i,
  },
  {
    ...BASE_BRAND,
    key: "luckys",
    name: "Lucky",
    pattern: /Lucky/i,
  },
  {
    ...BASE_BRAND,
    key: "market_street",
    name: "Market Street",
    pattern: /Market Street/i,
  },
  {
    ...BASE_BRAND,
    key: "pak_n_save",
    name: "Pak 'n Save",
    pattern: /Pak N Save/i,
  },
  {
    key: "pavilions",
    name: "Pavilions",
    pattern: /Pavilions/i,
  },
  {
    ...BASE_BRAND,
    key: "randalls_pharmacy",
    name: "Randalls Pharmacy",
    pattern: /Randalls Pharmacy/i,
  },
  {
    ...BASE_BRAND,
    key: "randalls",
    name: "Randalls",
    pattern: /Randalls/i,
  },
  {
    ...BASE_BRAND,
    key: "safeway",
    name: "Safeway",
    url: "https://www.safeway.com/pharmacy/covid-19.html",
    pattern: /Safeway/i,
  },
  {
    ...BASE_BRAND,
    key: "shaws",
    name: "Shaw's",
    pattern: /Shaw/i,
  },
  {
    ...BASE_BRAND,
    key: "star_market",
    name: "Star Market",
    pattern: /Star Market/i,
  },
  {
    ...BASE_BRAND,
    key: "tom_thumb",
    name: "Tom Thumb",
    pattern: /Tom Thumb/i,
  },
  {
    ...BASE_BRAND,
    key: "united",
    name: "United Supermarkets",
    pattern: /United/i,
  },
  {
    ...BASE_BRAND,
    key: "vons",
    name: "Vons",
    pattern: /Vons/i,
  },
  {
    ...BASE_BRAND,
    key: "albertsons_corporate",
    name: "ALB Corporate Office",
    pattern: /Corporate Office/i,
  },
];

function warn(message, context) {
  console.warn(`Albertsons: ${message}`, context);
  Sentry.captureMessage(message, Sentry.Severity.Info);
}

async function fetchRawData() {
  const response = await httpClient(API_URL, {
    // Bust caches with a random querystring.
    searchParams: { v: Math.random() * 999999999999 },
    responseType: "json",
    timeout: 30000,
  });

  return {
    validAt: DateTime.fromHTTP(response.headers["last-modified"], {
      zone: "utc",
    }).toISO(),
    data: response.body,
  };
}

async function getData(states) {
  const { validAt, data } = await fetchRawData();
  const checkedAt = new Date().toISOString();
  return data
    .map((entry) => formatLocation(entry, validAt, checkedAt))
    .filter((location) => states.includes(location.state));
}

// TODO: Unify address parsing with NJVSS and generale in utils module.
const addressFieldParts = /^(?<name>.+?)\s+-\s+(?<address>.+)$/;
const addressPattern = /^(.+),\s+([^,]+),\s+([A-Z]{2}),\s+(\d+(-\d{4})?)\s*$/i;

/**
 * Parse a location address from Albertsons. Note the location's name is part of
 * the address.
 * @param {string} address
 * @returns {{name: string, address_lines: Array<string>, city: string, state: string, postal_code: string}}
 */
function parseAddress(text) {
  const partMatch = text.match(addressFieldParts);
  if (!partMatch) {
    warn("Could not separate name from address", { address: text });
    return null;
  }
  const { name, address } = partMatch.groups;

  // FIXME: sometimes the name repeats after the store number
  // e.g. "Safeway 3189 Safeway"

  const match = address.match(addressPattern);
  if (!match) {
    warn("Could not parse address", { address });
    return null;
  }

  let postal_code = match[4];
  if (postal_code.split("-")[0].length < 5) {
    warn("Invalid ZIP code in address", { address });
    // Set as undefined so we don't override manual fixes in the DB.
    postal_code = undefined;
  }

  return {
    name: name.trim(),
    address_lines: [match[1]],
    city: match[2],
    state: match[3].toUpperCase(),
    postal_code,
  };
}

function formatAvailability(raw) {
  if (raw === "yes") {
    return Available.yes;
  } else if (raw === "no") {
    return Available.no;
  } else {
    warn(`Unexpected availability: ${raw}`);
    return Available.unknown;
  }
}

function formatProducts(raw) {
  if (!raw) return undefined;

  return raw
    .map((value) => {
      const formatted = PRODUCT_NAMES[value.toLowerCase()];
      if (!formatted) {
        warn(`Unknown 'drugName' value: ${value}`);
      }
      return formatted;
    })
    .filter(Boolean);
}

function formatLocation(data, validAt, checkedAt) {
  const address = parseAddress(data.address);
  if (!address) return null;

  const brand = BRANDS.find((item) => item.pattern.test(address.name));
  if (!brand) {
    warn("Could not find a matching brand", { name: address.name });
    return null;
  }

  // XXX: matching for brands!
  // TODO: match store number from the name? It's different from the Albertson's-wide ID
  const external_ids = [];

  return {
    ...address,
    external_ids,
    provider: "albertsons",
    location_type: LocationType.pharmacy,
    position: {
      longitude: parseFloat(data.long),
      latitude: parseFloat(data.lat),
    },

    // These aren't currently available
    // county,
    // info_phone,

    info_url: brand.url,
    booking_url: data.coach_url || undefined,

    availability: {
      source: "univaf-albertsons",
      valid_at: validAt,
      checked_at: checkedAt,
      is_public: true,
      available: formatAvailability(data.availability),
      products: formatProducts(data.drugName),
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
  checkAvailability,
  API_URL,
};
