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
 *
 * Notes and caveats:
 *
 * Adult & Pediatric vaccinations get separate entries in the API. We combine
 * them into a single output entry per physical location, and preserve their
 * individual booking locations in `meta.booking_url_adult` and
 * `meta.booking_url_pediatric`.
 */

const Sentry = require("@sentry/node");
const { groupBy } = require("lodash");
const { DateTime } = require("luxon");
const {
  createWarningLogger,
  httpClient,
  parseUsAddress,
  getUniqueExternalIds,
  unpadNumber,
} = require("../../utils");
const {
  Available,
  LocationType,
  VaccineProduct,
  PediatricVaccineProducts,
} = require("../../model");
const { ParseError } = require("../../exceptions");
const { corrections } = require("./corrections");

const API_URL =
  "https://s3-us-west-2.amazonaws.com/mhc.cdn.content/vaccineAvailability.json";

// The API gives us nice, deep-linked booking URLs for every entry, but in
// locations where both adult & pediatric vaccines are offered, they have
// different booking URLs. Since our locations only have one `booking_url`
// field, we use this generic URL instead in those cases.
const GENERIC_BOOKING_URL = "https://www.mhealthappointments.com/covidappt";

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
  // Albertsons is now operating some clinics outside its actual stores, and
  // this is meant to cover those. The names don't follow any real pattern, so
  // we do our best by matching anything that doesn't look like some words
  // followed by a number (since that usually indicates a store of some sort).
  {
    ...BASE_BRAND,
    key: "community_clinic",
    name: "Community Clinic",
    locationType: LocationType.clinic,
    pattern: {
      test: (name) => !/\w+\s+#?\d+$/.test(name),
    },
  },
];

const warn = createWarningLogger("Albertsons");

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
    .filter(Boolean)
    .filter((location) => states.includes(location.state));

  // Adult & Pediatric vaccines at the same locations get different listings in
  // the Albertsons API, so we need to group and merge them.
  const groups = groupBy(formatted, (location) => {
    const storeId = location.external_ids.find(
      (id) => id[0] === "albertsons_store_number"
    );
    return storeId?.[1] ?? location.name;
  });

  return Object.values(groups)
    .map((group) => {
      if (group.length === 1) return group[0];

      const adult = group.find((l) => l.meta.booking_url_adult);
      const pediatric = group.find((l) => l.meta.booking_url_pediatric);

      if (!adult || !pediatric) {
        warn(
          "Trying to merge locations other than an adult and pediatric!",
          group
        );
        return null;
      }

      const result = Object.assign({}, ...group);
      result.meta = {
        ...adult.meta,
        booking_url_adult: adult.booking_url,
        booking_url_pediatric: pediatric.booking_url,
      };
      result.booking_url = GENERIC_BOOKING_URL;
      result.external_ids = getUniqueExternalIds(
        group.flatMap((l) => l.external_ids)
      );
      const products = [
        ...new Set(
          group.flatMap((l) => l.availability.products).filter(Boolean)
        ),
      ];
      result.availability.products = products.length ? products : undefined;
      result.availability.available = Available.unknown;
      if (group.some((l) => l.availability.available === Available.yes)) {
        result.availability.available = Available.yes;
      } else if (
        group.every((l) => l.availability.available === Available.no)
      ) {
        result.availability.available = Available.no;
      }

      return result;
    })
    .filter(Boolean);
}

const urlPattern = /https?:\/\/[^/]+\.\w\w+/i;
const addressFieldParts = /^\s*(?<name>.+?)\s*-\s+(?<address>.+)$/;
const pediatricPrefixes = [
  /^Pfizer Child\s*-\s*(?<body>.*)$/i,
  /^Ages 5\+ welcome\s*-\s*(?<body>.*)$/i,
  /^All ages welcome 5\+\s+(?<body>.*)$/i,
];

/**
 * Parse a location name and address from Albertsons (they're both part of
 * the same string).
 * @param {string} text
 * @returns {{name: string, storeBrand: string|undefined, storeNumber: string|undefined, isPediatric: boolean, address: {lines: Array<string>, city: string, state: string, zip?: string}}}
 */
function parseNameAndAddress(text) {
  // Some locations have names like:
  //   https://kordinator.mhealthcoach.net/vcl/1636075700051 - Vons - 3439 Via Montebello, Carlsbad, CA, 92009
  // We've yet to see any that have enough info to be useful (e.g. no store # in
  // the example above), so just throw as an error here.
  if (urlPattern.test(text)) {
    throw new ParseError(`Found a URL in the name "${text}"`);
  }

  // Some locations have separate pediatric and non-pediatric API locations.
  // The pediatric ones oftne have prefixes like "Pfizer Child".
  let pediatric = false;
  let body = text;
  for (const pattern of pediatricPrefixes) {
    const match = text.match(pattern);
    if (match) {
      pediatric = true;
      body = match.groups.body;
      break;
    }
  }

  const partMatch = body.match(addressFieldParts);
  if (!partMatch) {
    throw new ParseError(`Could not separate name and address in "${body}"`);
  }
  let { name, address } = partMatch.groups;

  // Most store names are in the form "<Brand Name> NNNN", e.g. "Safeway 3189".
  // Sometimes names repeat after the store number, e.g. "Safeway 3189 Safeway".
  const numberMatch = name.match(
    /^(?<name>.*?)\s+(?<number>\d{3,6})(?:\s+\1)?/
  );
  let storeNumber;
  if (numberMatch) {
    storeNumber = unpadNumber(numberMatch.groups.number);
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

  const products = raw
    .map((value) => {
      const formatted = PRODUCT_NAMES[value.toLowerCase()];
      if (!formatted) {
        warn(`Unknown 'drugName' value: ${value}`);
      }
      return formatted;
    })
    .filter(Boolean);

  return products.length ? products : undefined;
}

function formatLocation(data, validAt, checkedAt) {
  // Apply corrections for known-bad source data.
  if (data.id in corrections) {
    Object.assign(data, corrections[data.id]);
  }

  let { name, storeNumber, storeBrand, address, isPediatric } =
    parseNameAndAddress(data.address);
  if (!storeBrand) {
    return null;
  }

  // Pediatric-only locations usually say so in the name and also list only
  // pediatric products. However, some only do one of those, so we need to
  // handle them as well.
  const products = formatProducts(data.drugName);
  isPediatric =
    isPediatric ||
    (products?.length && products.some((p) => PediatricVaccineProducts.has(p)));

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
    location_type: storeBrand.locationType || LocationType.pharmacy,
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
      products,
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
  formatLocation,
  API_URL,
};
