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
const {
  httpClient,
  parseUsAddress,
  getUniqueExternalIds,
} = require("../../utils");
const { LocationType, VaccineProduct, Available } = require("../../model");
const { ParseError } = require("../../exceptions");

const API_URL =
  "https://s3-us-west-2.amazonaws.com/mhc.cdn.content/vaccineAvailability.json";

// Maps Albertsons product names to our product names.
const PRODUCT_NAMES = {
  pfizer: VaccineProduct.pfizer,
  moderna: VaccineProduct.moderna,
  jnj: VaccineProduct.janssen,
  pfizerchild: VaccineProduct.pfizerAge5_11,
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
  console.warn(`Albertsons: ${message}`, context || "");
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

  const lastModified = response.headers["last-modified"];

  return {
    validAt: lastModified
      ? DateTime.fromHTTP(lastModified, { zone: "utc" }).toISO()
      : undefined,
    data: response.body,
  };
}

function groupBy(items, keyFunction) {
  const groups = Object.create(null);
  for (const item of items) {
    const key = keyFunction(item);
    if (!(key in groups)) {
      groups[key] = [];
    }
    groups[key].push(item);
  }
  return groups;
}

async function getData(states) {
  const { validAt, data } = await fetchRawData();
  const checkedAt = new Date().toISOString();

  const formatted = data
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

  // Adult & Pediatric vaccines at the same locations get different listings in
  // the Albertsons API, so we need to group and merge them.
  const groups = groupBy(formatted, (location) => {
    return (
      location.external_ids.find(
        (id) => id[0] === "albertsons_store_number"
      )?.[1] ?? location.name
    );
  });

  return Object.values(groups).map((group) => {
    if (group.length === 1) return group[0];

    const adult = group.find((l) => l.meta.booking_url_adult);
    const pediatric = group.find((l) => l.meta.booking_url_pediatric);

    if (!adult || !pediatric) {
      warn(
        "Trying to merge locations other than an adult and pediatric!",
        group
      );
    }

    const result = Object.assign({}, ...group);
    result.meta = {
      ...adult.meta,
      booking_url_adult: adult.booking_url,
      booking_url_pediatric: pediatric.booking_url,
    };
    result.booking_url = adult.booking_url;
    result.external_ids = getUniqueExternalIds(
      group.flatMap((l) => l.external_ids)
    );
    result.availability.products = [
      ...new Set(group.flatMap((l) => l.availability.products)),
    ];
    result.availability.available = Available.unknown;
    if (group.some((l) => l.availability.available === Available.yes)) {
      result.availability.available = Available.yes;
    } else if (group.every((l) => l.availability.available === Available.no)) {
      result.availability.available = Available.no;
    }

    return result;
  });
}

const addressFieldParts = /^\s*(?<name>.+?)\s+-\s+(?<address>.+)$/;
const pediatricPrefixParts = /^(?<pediatric>Pfizer Child\s*-\s*)?(?<body>.*)$/i;

/**
 * Parse a location name and address from Albertsons (they're both part of
 * the same string).
 * @param {string} text
 * @returns {{name: string, storeBrand: string|undefined, storeNumber: string|undefined, isPediatric: boolean, address: {lines: Array<string>, city: string, state: string, zip?: string}}}
 */
function parseNameAndAddress(text) {
  // Some locations have separate pediatric and non-pediatric API locations.
  // The pediatric ones are prefixed with "Pfizer Child".
  const { pediatric, body } = text.match(pediatricPrefixParts).groups;

  const partMatch = body.match(addressFieldParts);
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

  const storeBrand = BRANDS.find((item) => item.pattern.test(name));
  if (!storeBrand) {
    warn("Could not find a matching brand", { name });
  }

  return {
    name: name.trim(),
    storeBrand,
    storeNumber,
    address: parseUsAddress(address),
    isPediatric: !!pediatric,
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
  const { name, storeNumber, storeBrand, address, isPediatric } =
    parseNameAndAddress(data.address);
  if (!storeBrand) {
    return null;
  }

  const external_ids = [
    ["albertsons", data.id],
    [`albertsons_${storeBrand.key}`, data.id],
  ];
  if (storeNumber) {
    external_ids.push([storeBrand.key, storeNumber]);
    external_ids.push([
      "albertsons_store_number",
      `${storeBrand.key}:${storeNumber}`,
    ]);
  }

  const bookingType = isPediatric ? "pediatric" : "adult";

  return {
    name,
    external_ids,
    provider: "albertsons",
    location_type: LocationType.pharmacy,
    address_lines: address.lines,
    city: address.city,
    state: address.state,
    postal_code: address.zip,
    position: {
      longitude: parseFloat(data.long),
      latitude: parseFloat(data.lat),
    },

    info_url: storeBrand.url,
    booking_url: data.coach_url || undefined,
    meta: {
      albertsons_region: data.region,
      [`booking_url_${bookingType}`]: data.coach_url || undefined,
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
