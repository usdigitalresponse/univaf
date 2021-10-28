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
  // Sentry does better fingerprinting with an actual exception object.
  if (message instanceof Error) {
    Sentry.captureException(message, { level: Sentry.Severity.Info });
  } else {
    Sentry.captureMessage(message, Sentry.Severity.Info);
  }
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
    .map((entry) => {
      let formatted;
      Sentry.withScope((scope) => {
        scope.setContext("location", {
          id: entry.id,
          address: entry.address,
          provider: "albertsons",
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

const addressFieldParts = /^\s*(?<name>.+?)\s+-\s+(?<address>.+)$/;

/**
 * Parse a location name and address from Albertsons (they're both part of
 * the same string).
 * @param {string} text
 * @returns {{name: string, storeNumber?: string, address: {lines: Array<string>, city: string, state: string, zip?: string}}}
 */
function parseNameAndAddress(text) {
  const partMatch = text.match(addressFieldParts);
  if (!partMatch) {
    throw new ParseError(`Could not separate name and address in "${address}"`);
  }
  let { name, address } = partMatch.groups;

  // Most store names are in the form "<Brand Name> NNNN", e.g. "Safeway 3189".
  // Sometimes names repeat after the store number, e.g. "Safeway 3189 Safeway".
  const numberMatch = name.match(
    /^(?<name>.*?)\s+(?<number>\d{3,6})(?:\s+\1)?/
  );
  let storeNumber;
  if (numberMatch) {
    storeNumber = numberMatch.groups.number;
    name = `${numberMatch.groups.name} ${storeNumber}`;
  }

  return {
    name: name.trim(),
    storeNumber,
    address: parseUsAddress(address),
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
  const address = parseNameAndAddress(data.address);
  const brand = BRANDS.find((item) => item.pattern.test(address.name));
  if (!brand) {
    warn("Could not find a matching brand", { name: address.name });
    return null;
  }

  const external_ids = [
    ["albertsons", data.id],
    [`albertsons_${brand.key}`, data.id],
  ];
  if (address.storeNumber) {
    external_ids.push([brand.key, address.storeNumber]);
  }

  return {
    name: address.name,
    external_ids,
    provider: "albertsons",
    location_type: LocationType.pharmacy,
    address_lines: address.address.lines,
    city: address.address.city,
    state: address.address.state,
    postal_code: address.address.zip,
    position: {
      longitude: parseFloat(data.long),
      latitude: parseFloat(data.lat),
    },

    info_url: brand.url,
    booking_url: data.coach_url || undefined,
    meta: {
      albertsons_region: data.region,
    },

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
