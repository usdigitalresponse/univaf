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
const config = require("../../config");
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
const { findKnownAlbertsons } = require("./locations");

const API_URL =
  "https://s3-us-west-2.amazonaws.com/mhc.cdn.content/vaccineAvailability.json";

// The API gives us nice, deep-linked booking URLs for every entry, but in
// locations where both adult & pediatric vaccines are offered, they have
// different booking URLs. Since our locations only have one `booking_url`
// field, we use this generic URL instead in those cases.
const GENERIC_BOOKING_URL = "https://www.mhealthappointments.com/covidappt";

// There are test locations in the data; this pattern should match their names
// so we know to skip over them.
const TEST_NAME_PATTERN = /^public test$/i;

// There are locations with addresses we should ignore, since these seem wrong
// enough to be intentional, and even show up this way in their booking UI!
// (The only instances of this we've seen are for "Dallas ISD"; our best guess
// is that they are used to manage vaccinations across Dallas public schools.)
const IGNORE_ADDRESS_PATTERN = / \., \., [A-Z]{2}, \d{5}/;

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
    pattern: /Albertsons|\bABS\s/i,
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
    pattern: /Pak '?N Save/i,
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
    key: "sav_on",
    name: "Sav-On Pharmacy",
    pattern: /Sav-?On/i,
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
    // "United" is really common in other names, so we need to a more complex
    // pattern than most other stores.
    pattern: /United (#?\d|\w+market)/i,
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
    isNotAStore: true,
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
    isNotAStore: true,
    pattern: {
      test: (name) => {
        // Some locations need explicit support because they look like "name
        // followed by store number", which we explicitly disallow for community
        // clinics in the first pattern.
        return (
          !/(\w+\s+#?\d+$)|^\d+\s/.test(name) ||
          /^teamsters local/i.test(name) ||
          /^chicago fire department/i.test(name)
        );
      },
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
          console.error(error.stack);
        }
      });
      return formatted;
    })
    .filter(Boolean)
    .filter((location) => states.includes(location.state));

  // Adult & Pediatric vaccines at the same locations get different listings in
  // the Albertsons API, so we need to group and merge them.
  const findId = (location, system) =>
    location.external_ids.find((id) => id[0] === system);
  const groups = groupBy(formatted, (location) => {
    const storeId = findId(location, "albertsons_store_number");
    const communityClinicId = findId(location, "albertsons_community_clinic");
    const mHealthId = findId(location, "albertsons");

    if (storeId) {
      return storeId[1];
    } else if (communityClinicId) {
      // Community clinics don't have any real identifiers, so use the name.
      return location.name;
    } else if (mHealthId) {
      return mHealthId[1];
    } else {
      // This should never happen! Every location should have an mHealthId.
      warn(new Error("Albertsons location has no ID", location));
      return Math.random().toString();
    }
  });

  return Object.values(groups)
    .map((group) => {
      if (group.length === 1) return group[0];

      const adult = group.find((l) => l.meta.booking_url_adult);
      const pediatric = group.find((l) => l.meta.booking_url_pediatric);

      // If a location had no available vaccines and had no special naming
      // prefix, we won't know whether it is adult or pediatric. We can't know
      // whether this is a problem or not, so always allow it.
      const unknown = group.find((l) => !l.availability.products);
      if (!unknown && (!adult || !pediatric)) {
        warn(
          "Trying to merge locations other than an adult and pediatric!",
          group
        );
        return null;
      }

      const result = Object.assign({}, ...group);
      result.meta = {
        ...unknown?.meta,
        ...pediatric?.meta,
        ...adult?.meta,
        booking_url_adult: adult?.booking_url,
        booking_url_pediatric: pediatric?.booking_url,
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

  // The main goal here is to prevent age ranges (e.g. "5 - 11 years old") from
  // getting split up in the next step. But this also puts in an en-dash for
  // better typography. ;)
  const cleanText = text.replace(/(\d+) - (\d+ year)/g, "$1\u2013$2");

  // The address field is freeform, and often has a whole mess of metadata
  // stuffed into it (actual address, location name, whether it's pediatric
  // only, etc.). Generally, different pieces of information are separated by
  // " - " and the actual address always comes last. Our goal here is to
  // separate the address and other bits.
  const sections = cleanText.split(/\s*-\s+/g).map((s) => s.trim());
  let address = sections.pop();
  let maybeAddressPart;
  while ((maybeAddressPart = sections.pop())) {
    if (/^\d+$/.test(maybeAddressPart)) {
      // If it's just a number, it's probably the building number with a dash
      // separating it from the street name (we've seen this sometimes when
      // streets are numberic, e.g. "1600 - 16th Street").
      address = `${maybeAddressPart} ${address}`;
    } else if (/^\d+\s+\w+$/.test(maybeAddressPart)) {
      // A number followed by a single word is probably the first part of a
      // street name that had a dash in it, e.g. "1600 Berlin - Cross Rd".
      // (Usually there aren't spaces around the dash, but we've seen some.)
      address = `${maybeAddressPart}-${address}`;
    } else {
      sections.push(maybeAddressPart);
      break;
    }
  }
  // Sometimes we have just a brand name separated from the rest, even though
  // the brand name is elsewhere in the name. In these cases, drop it.
  // e.g. "Safeway 149 - Safeway - 1610 West Lincoln, Yakima, WA, 98902"
  const withoutRedundantSections = sections
    .map((section) => {
      if (!/\s/.test(section)) {
        for (const otherSection of sections) {
          if (otherSection !== section && otherSection.includes(section)) {
            return null;
          }
        }
      }
      return section;
    })
    .filter(Boolean);

  let name = withoutRedundantSections.join(" - ");
  if (!name) {
    throw new ParseError(`Could not separate name and address in "${text}"`);
  }

  // Some locations have separate pediatric and non-pediatric API locations.
  // The pediatric ones often have text in the name identifying them as such.
  const isPediatric = /\bchild|\bpediatric|\bpeds?\b|\bages? (5|6)/i.test(name);

  // Most store names are in the form "<Brand Name> NNNN", e.g. "Safeway 3189".
  // Sometimes names repeat after the store number, e.g. "Safeway 3189 Safeway".
  const numberMatch = name.match(
    /^(?<name>.*?)\s+#?(?<number>\d{2,6})(?:\s+\1)?/
  );
  let storeNumber;
  if (numberMatch) {
    storeNumber = unpadNumber(numberMatch.groups.number);
    name = `${numberMatch.groups.name} ${storeNumber}`;
  }

  const storeBrand = BRANDS.find((item) => item.pattern.test(name));

  return {
    name: name.trim(),
    storeBrand,
    storeNumber,
    address: parseUsAddress(address),
    isPediatric,
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

// For debugging: Track how many entries matched known locations by what method.
const knownLocationMatches = {};

function logMatchDebugInfo(match, rawData, address, storeBrand, storeNumber) {
  if (!config.debug) return;

  const matchType = match?.method ?? "no_match";
  knownLocationMatches[matchType] = (knownLocationMatches[matchType] || 0) + 1;

  if (match) {
    if (match.data.c_parentEntityID !== storeNumber) {
      const matchAddress = `${match.data.address.line1}, ${match.data.address.city}, ${match.data.address.region} ${match.data.address.postalCode}`;
      console.error(
        "Method:",
        match.method,
        " / Score:",
        match.score || "-",
        " / Factors:",
        match.factors || "-"
      );
      const found = match.data;
      console.error(
        "Appointments:",
        `${storeBrand?.name ?? "[no brand]"} #${storeNumber}`.padEnd(40),
        `/  ${address}  /  ${rawData.address}`
      );
      console.error(
        "Match:       ",
        `${found.name} #${found.c_parentEntityID}`.padEnd(40),
        `/  ${matchAddress}`,
        `\n              (c_oldStoreID: ${found.c_oldStoreID})`
      );
      console.error("------------");
    }
  } else if (!storeBrand || !storeBrand.isNotAStore) {
    console.error("NO MATCH:", rawData.address);
    console.error(`  Parsed: ${storeBrand?.name} #${storeNumber}, ${address}`);
    console.error("------------");
  }
}

function formatLocation(data, validAt, checkedAt) {
  // Apply corrections for known-bad source data.
  if (data.id in corrections) {
    Object.assign(data, corrections[data.id]);
  }

  if (IGNORE_ADDRESS_PATTERN.test(data.address)) {
    return null;
  }

  let { name, storeNumber, storeBrand, address, isPediatric } =
    parseNameAndAddress(data.address);

  // There are test locations in the data, and we should skip them.
  if (TEST_NAME_PATTERN.test(name)) {
    return null;
  }

  const matchAddress = `${address.lines[0]}, ${address.city}, ${address.state} ${address.zip}`;
  const pharmacyMatch = findKnownAlbertsons(
    matchAddress,
    { lat: data.lat, long: data.long },
    storeBrand,
    storeNumber
  );
  logMatchDebugInfo(pharmacyMatch, data, matchAddress, storeBrand, storeNumber);

  let timezone;
  let info_phone;
  let info_url = storeBrand?.url;
  let description = data.description;
  let position = {
    longitude: parseFloat(data.long),
    latitude: parseFloat(data.lat),
  };
  if (pharmacyMatch && pharmacyMatch.score > 0.2) {
    storeNumber = pharmacyMatch.data.c_parentEntityID;
    // TODO: consider using c_geomodifier for the name. (We'd still need to
    // create a string with the store number for matching the brand, though.)
    name = `${pharmacyMatch.data.name} #${storeNumber}`;
    storeBrand = BRANDS.find((item) => item.pattern.test(name));
    if (!storeBrand || storeBrand.key === "community_clinic") {
      // Unlike appointment data, we should *never* fail to match a brand to
      // data from our scraped, saved list of known pharmacy locations.
      throw new Error(`Failed to match a brand to known location "${name}"`);
    }

    address = {
      lines: [
        pharmacyMatch.data.address.line1,
        pharmacyMatch.data.address.line2,
        pharmacyMatch.data.address.line3,
      ].filter(Boolean),
      city: pharmacyMatch.data.address.city,
      state: pharmacyMatch.data.address.region,
      zip: pharmacyMatch.data.address.postalCode,
    };
    timezone = pharmacyMatch.data.timezone;
    info_url = pharmacyMatch.data.c_pagesURL || storeBrand.url;
    info_phone = pharmacyMatch.data.mainPhone?.display;
    description =
      description ||
      pharmacyMatch.data.c_metaInformation?.description ||
      pharmacyMatch.data.covidVaccineSiteInstructions ||
      pharmacyMatch.data.description;
    if (pharmacyMatch.data.geocodedCoordinate) {
      position = {
        longitude: parseFloat(pharmacyMatch.data.geocodedCoordinate.long),
        latitude: parseFloat(pharmacyMatch.data.geocodedCoordinate.lat),
      };
    }
  }

  // If we couldn't match this to some expected brand, don't attempt to output
  // a location since we could wind up with bad or mis-parsed data.
  if (!storeBrand) {
    warn("Could not find a matching brand", {
      mhealth_id: data.id,
      address: data.address,
    });
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
    position,

    info_phone,
    info_url,
    booking_url: data.coach_url || undefined,
    meta: {
      mhealth_address: data.address,
      albertsons_region: data.region,
      [`booking_url_${bookingType}`]: data.coach_url || undefined,
      timezone,
    },
    description,

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
  stores.forEach((store) => handler(store, { update_location: true }));
  if (config.debug) {
    console.error("Matches to known locations:", knownLocationMatches);
  }
  return stores;
}

module.exports = {
  checkAvailability,
  formatLocation,
  API_URL,
};
