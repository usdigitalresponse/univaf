/**
 * Load data from the CDC open data portal (https://data.cdc.gov)
 *
 * This source gets information about locations and their vaccine *stock* from
 * the CDC's open data portal. Since it has stock information rather than
 * appointment info, we should view the `availability.available` field this
 * source generates with some skepticism. (That said, most places have a major
 * supply surplus now, so stock may be reasonable to use.)
 *
 * The more important need this fills for us is determining *which products*
 * are available at a location, as well as getting us a more comprehensive list
 * of locations and metadata, like operating hours. Many official sources
 * (e.g. CVS's API) don't include product info, so combining this with other
 * data lets us paint a more complete picture overall.
 *
 * There are some idiosyncracies to keep in mind here:
 * - The dataset is updated daily.
 * - The data comes from the pharmacies and clinics listed, and each does so on
 *   a different schedule. While the dataset is published once a day, individual
 *   locations may be more out of date or intermittently updated than that.
 * - Some locations send automated reports while others enter data by hand.
 *   Sometimes there are typos, mistakes, or fields that conflict.
 *
 * Metadata about this dataset: https://data.cdc.gov/resource/5jp2-pgaw
 */

const Sentry = require("@sentry/node");

const { Available, VaccineProduct } = require("../../model");
const {
  httpClient,
  oneLine,
  titleCase,
  unpadNumber,
  cleanUrl,
} = require("../../utils");

const API_HOST = "https://data.cdc.gov";
const API_PATH = "/resource/5jp2-pgaw.json";

function warn(message, context) {
  console.warn(`CDC API: ${message}`, context);
  Sentry.captureMessage(message, Sentry.Severity.Info);
}

function error(message, context) {
  console.error(`CDC API: ${message}`, context);
  Sentry.captureMessage(message, Sentry.Severity.Error);
}

async function* queryState(state) {
  const PAGE_SIZE = 5000;

  let offset = 0;
  while (true) {
    try {
      const response = await httpClient({
        url: `${API_HOST}${API_PATH}`,
        searchParams: {
          $limit: PAGE_SIZE,
          $offset: offset,
          loc_admin_state: state,
        },
      });
      const results = JSON.parse(response.body);

      for (const result of results) {
        yield result;
      }

      if (results.length < PAGE_SIZE) {
        return;
      } else {
        offset += PAGE_SIZE;
      }
    } catch (e) {
      error(`Error fetching CDC data`, e);
      return;
    }
  }
}

function formatStore(storeItems, checkedAt) {
  if (storeItems.length == 0) {
    return null;
  }

  let result;
  Sentry.withScope((scope) => {
    const base = storeItems[0];
    scope.setContext("location", {
      id: base.provider_location_guid,
      name: base.loc_name,
      provider: "cdc",
    });

    const storeExternalIds = getStoreExternalIds(base);
    if (!storeExternalIds.length) {
      return null;
    }

    const addressLines = [
      base.loc_admin_street1,
      base.loc_admin_street2,
    ].filter((l) => l && l.match(/[a-z]+/i));

    const metaFields = [
      "insurance_accepted",
      "walkins_accepted",

      // TODO: better structure open hours information
      "sunday_hours",
      "monday_hours",
      "tuesday_hours",
      "wednesday_hours",
      "thursday_hours",
      "friday_hours",
      "saturday_hours",
    ];
    const meta = {};
    for (const field of metaFields) {
      meta[field] = base[field];
    }

    const productFields = [
      "ndc",
      "med_name",
      "in_stock",
      "supply_level",
      "quantity_last_updated",
    ];
    const productList = storeItems.map((item) => {
      const out = {};
      for (const field of productFields) {
        out[field] = item[field];
      }
      return out;
    });

    result = {
      external_ids: [
        ["vaccines_gov", base.provider_location_guid],
        ...storeExternalIds,
      ],
      name: titleCase(base.loc_name),
      provider: storeExternalIds[0][0],
      address_lines: addressLines,
      city: titleCase(base.loc_admin_city),
      state: base.loc_admin_state,
      postal_code: base.loc_admin_zip,
      info_phone: base.loc_phone,
      info_url: cleanUrl(base.web_address),
      meta,

      availability: {
        source: "cdc",
        checked_at: checkedAt,
        valid_at: formatValidAt(productList),
        available: formatAvailable(productList),
        products: formatProductTypes(productList),
      },
    };

    if (base.longitude && base.latitude) {
      const position = {
        longitude: Number(base.longitude),
        latitude: Number(base.latitude),
      };
      if (isNaN(position.longitude) || isNaN(position.latitude)) {
        error("longitude and latitude are not numbers");
      } else {
        result.position = position;
      }
    }
  });
  return result;
}

/**
 * Get a simplistic, numeric location external ID value that should be a store
 * number for whatever chain a location belongs to.
 */
function getSimpleId(location) {
  // Handle numeric store numbers
  let m = location.loc_store_no.match(/^(?<storeNo>\d+)$/);

  if (!m) {
    // Handle VTrckS pins like RA105587 -> 5587 instead of pure numeric strings.
    // For major pharmacies, these are usually a 3-character prefix followed
    // by the store number. (They get to pick everything after the prefix.)
    m = location.loc_store_no.match(/^([A-Z]{3}|[A-Z]{2}\d)(?<storeNo>\d{5})/i);
  }

  return m ? unpadNumber(m.groups.storeNo) : null;
}

// Walmart and Sam's are listed with store numbers in the format
// `10-<store_number>`. They always have `10-` as the prefix, and not any other
// number. ¯\_(ツ)_/¯
function getWalmartId(location) {
  if (location.loc_store_no.startsWith("10-")) {
    return unpadNumber(location.loc_store_no.slice(3));
  }

  // When the number is not in loc_store_no, it may be formatted like above
  // (10-NNN) or without the "10-" prefix.
  const numberInName = location.loc_name.match(
    /^(?:Walmart|Sam['\u2019]?s Club) [^#\d]*#?(?:10-)?(\d+)$/i
  );
  if (numberInName) {
    return unpadNumber(numberInName[1]);
  }

  warn("Unexpected Walmart/Sams ID format", {
    id: location.provider_location_guid,
    storeNumber: location.loc_store_no,
    storeName: location.loc_name,
  });
  return null;
}

const locationSystems = [
  { system: "costco", pattern: /^Costco/i },
  { system: "cvs", pattern: /^CVS/i },
  { system: "kroger", pattern: /^Kroger/i },
  { system: "publix", pattern: /^Publix/i },
  { system: "rite_aid", pattern: /^Rite Aid/i },
  { system: "safeway", pattern: /^SAFEWAY/i },
  { system: "walgreens", pattern: /^Walgreens/i },
  { system: "sams_club", pattern: /^Sams Club/i, getId: getWalmartId },
  { system: "walmart", pattern: /^Walmart/i, getId: getWalmartId },
  {
    system: "shoprite",
    // "Klein's Shoprite" is the same Shoprite as Shoprite, but just encompasses
    // a subset of stores in Maryland.
    pattern: /^(klein )?shoprite/i,
    getId(location) {
      let id;
      // This is the only one not formatted with a # sign.
      // TODO: this appears to be the same as store 322046, and I can't figure
      // out which is "correct". Ideally we'd just put in both, but the current
      // framework here can't handle that.
      if (location.loc_name.toLowerCase().trim() === "Shoprite Pharmacy 801") {
        id = "801";
      }
      // Some stores have a loc_store_no value, but some don't and just have
      // the store number in the name.
      if (!id) {
        id = getSimpleId(location) || location.loc_name.match(/#(\d+)/)?.[1];
      }
      return id;
    },
  },
  { system: "stop_and_shop", pattern: /^stop & shop/i },
  // Sav-On has a handful of locations with no store number. Not sure there's
  // any useful way to handle those.
  { system: "sav_on", pattern: /^sav-?on/i },
  // FIXME: Wegmans is disabled for now because the store numbers in CDC's data
  // don't match up to *anything* else I can find for Wegmans. You can get some
  // detailed data from https://shop.wegmans.com/api/v2/stores
  // We have "wegmans" IDs that correspond to `id` in that API, but it appears
  // the public facing store numbers (which are hard to find anyway) are really
  // the `retailer_store_id` field. There's also `ext_id` and
  // `store_banner.ext_id`. None of them match in any way to the CDC numbers.
  // { system: "wegmans", pattern: /^wegmans/i },
  { system: "genoa_healthcare", pattern: /^Genoa Healthcare/i },
  {
    system: "bartell",
    pattern: /bartell drug/i,
    getId(location) {
      // Bartell was a small pharmacy chain later purchased by Rite Aid. Within
      // Bartell's systems, stores are a 2 digit number. Within Rite Aid's
      // systems, they are a 4 digit number where the first 2 digits are "69",
      // sometimes with additional 0-padding.
      //   e.g. Bartell #58  =  Rite Aid #06958
      // CDC uses Rite Aid IDs, but we need to work with both systems.
      //
      // More details on Bartell stores at:
      //   https://www.bartelldrugs.com/wp-json/api/stores?per_page=100&orderby=title&order=ASC
      //
      // Also worth noting: it appears that the WA DoH API only sometimes
      // surfaces store numbers, and also has addresses and store names mixed
      // up in a few cases. Makes one worry about the data accuracy :|
      // There doesn't appear to be a simple way to match up to their data here.
      const id = location.loc_store_no.match(/^\s*0*69(\d\d)\s*$/)?.[1];
      if (!id) {
        warn("Unexpected Bartell ID format", {
          id: location.provider_location_guid,
          storeNumber: location.loc_store_no,
        });
      }
      return [
        ["bartell", id],
        ["rite_aid", `69${id}`],
      ];
    },
  },
  { system: "meijer", pattern: /^Meijer/i },
  {
    system: "southeastern_grocers_winn_dixie",
    pattern: /^Winn-?Dixie/i,
    getId(location) {
      const storeNumber = getSimpleId(location);
      if (storeNumber) {
        // We got these IDs originally from VaccineSpotter, and they are always
        // the store number prefixed with "1-".
        return `1-${storeNumber}`;
      }
      warn("Unexpected Winn-Dixie ID format", {
        id: location.provider_location_guid,
        storeNumber: location.loc_store_no,
      });
      return null;
    },
  },
  // These Hannaford store numbers do not match up to the store numbers on the
  // Hannaford website, but they *do* match up to store numbers in their COVID
  // vaccine scheduling system (rxtouch.com). Not sure if these are just
  // arbitrarily different, or if they are a pharmacy-specific ID or something.
  { system: "hannaford", pattern: /^Hannaford/i },
];

// FIXME: these need to be able to correct more than just the ID.
const mislabeledLocations = {
  // These are all actually Sam's Clubs, and the names are wrong, too :(
  // Check the Sam's website at: https://www.samsclub.com/club/<store_number>
  // This one has "not applicable" for the store number.
  "d3f48823-d527-49bd-ae93-cf66998f689e": { system: "walmart", value: "8169" },
  // And these ones all have "-<store number>", e.g. "-6270".
  "21b0ebe2-13fd-46d9-9ccb-56facd9f3b34": { system: "walmart", value: "6270" },
  "1f6938e4-06a3-4115-b760-7f202f4bc02e": { system: "walmart", value: "6689" },
  "dd6b4d94-0243-4017-8ef7-c2c806594b54": { system: "walmart", value: "6543" },
  "0e2c2e74-a160-457f-b1e2-6cc104d2a70d": { system: "walmart", value: "6680" },
  "019de7c9-956f-40b5-8e3b-deb67c8a1b95": { system: "walmart", value: "6690" },
};

function getStoreExternalIds(location) {
  const correction = mislabeledLocations[location.provider_location_guid];
  if (correction) {
    return [[correction.system, correction.value]];
  }

  for (const definition of locationSystems) {
    if (definition.pattern.test(location.loc_name)) {
      const idValue = (definition.getId || getSimpleId)(location);
      if (idValue) {
        return Array.isArray(idValue)
          ? idValue
          : [[definition.system, idValue]];
      }
      break;
    }
  }

  return [];
}

/**
 * Determine whether a particular vaccine product & location row indicates the
 * product is in stock. Returns unknown if the various stock-related fields
 * conflict (see below).
 *
 * This is not a perfect check, since the underlying data is not great. First,
 * many locations report manually, and therefore irregularly. Data is not always
 * fresh, even relative to the time it was entered.
 *
 * Further, this dataset contains two indicators for stock, and they often
 * disagree (30-40% of the time!):
 * - `in_stock` is a boolean indicating "Is this vaccine in stock for the public
 *   at this location?" It appears to always be an actual boolean.
 * - `supply_level` is a category indicating how long supply *should* last:
 *   -1 = No report, 0 = No supply, 1-4 = ranging from <24 hours to >48 hours.
 *   There's obviously a lot of room for editorializing there.
 *
 * ~2% of locations have all products mismatching on these fields.
 * ~20-30% of locations have some products with -1 for `supply_level`.
 * ~5-10% of locations have all prdoucts with -1 for `supply_level`.
 * @param {any} product a row for a particular product & location.
 * @returns {Available}
 */
function isInStock(product) {
  const supplyLevel = parseInt(product.supply_level, 10);
  if (product.in_stock && supplyLevel > 0) {
    return Available.yes;
  } else if (!product.in_stock && supplyLevel === 0) {
    return Available.no;
  } else {
    return Available.unknown;
  }
}

function formatValidAt(products) {
  const dates = products.map((p) => p.quantity_last_updated);
  dates.sort();
  return dates[dates.length - 1];
}

function formatAvailable(products) {
  let result = Available.no;
  for (const product of products) {
    const inStock = isInStock(product);
    if (inStock === Available.yes) {
      return inStock;
    } else if (inStock === Available.unknown) {
      result = inStock;
    }
  }
  return result;
}

const ndcLookup = {
  // from https://www.cdc.gov/vaccines/programs/iis/COVID-19-related-codes.html
  // and https://www2a.cdc.gov/vaccines/iis/iisstandards/vaccines.asp?rpt=ndc
  [normalizeNdc("00310-1222-10")]: VaccineProduct.astraZeneca, // use
  [normalizeNdc("00310-1222-15")]: VaccineProduct.astraZeneca, // sale

  // Pfizer original & booster are the same product and use the same code, so
  // they aren't distinguishable here (they are also the same dose).
  [normalizeNdc("59267-1000-01")]: VaccineProduct.pfizer, // use
  [normalizeNdc("59267-1000-02")]: VaccineProduct.pfizer, // sale
  [normalizeNdc("59267-1000-03")]: VaccineProduct.pfizer, // sale
  [normalizeNdc("59267-1025-01")]: VaccineProduct.pfizer, // use
  [normalizeNdc("59267-1025-02")]: VaccineProduct.pfizer, // sale
  [normalizeNdc("59267-1025-03")]: VaccineProduct.pfizer, // sale
  [normalizeNdc("59267-1025-04")]: VaccineProduct.pfizer, // sale
  // 00069-1000 is the same as above, but used when branded as "Comirnaty".
  [normalizeNdc("00069-1000-01")]: VaccineProduct.pfizer, // use
  [normalizeNdc("00069-1000-02")]: VaccineProduct.pfizer, // sale
  [normalizeNdc("00069-1000-03")]: VaccineProduct.pfizer, // sale
  // 00069-2025 *appears* to have replaced the 00069-1000 codes for "Comirnaty"
  // branding. (We never saw the old ones used in practice. They are still
  // listed on the CDC's COVID-19 codes page, but not on CDC's complete
  // crosswalk of all vaccine codes, where these new ones are listed.)
  [normalizeNdc("00069-2025-01")]: VaccineProduct.pfizer, // use
  [normalizeNdc("00069-2025-10")]: VaccineProduct.pfizer, // sale
  [normalizeNdc("00069-2025-25")]: VaccineProduct.pfizer, // sale

  [normalizeNdc("59267-1055-01")]: VaccineProduct.pfizerAge5_11, // use
  [normalizeNdc("59267-1055-02")]: VaccineProduct.pfizerAge5_11, // sale
  [normalizeNdc("59267-1055-04")]: VaccineProduct.pfizerAge5_11, // sale

  [normalizeNdc("59267-0078-01")]: VaccineProduct.pfizerAge2_4, // use
  [normalizeNdc("59267-0078-02")]: VaccineProduct.pfizerAge2_4, // sale
  [normalizeNdc("59267-0078-04")]: VaccineProduct.pfizerAge2_4, // sale

  [normalizeNdc("59676-0580-05")]: VaccineProduct.janssen, // use
  [normalizeNdc("59676-0580-15")]: VaccineProduct.janssen, // sale

  [normalizeNdc("80631-0100-01")]: VaccineProduct.novavax, // sale
  [normalizeNdc("80631-0100-10")]: VaccineProduct.novavax, // use

  // Moderna original & booster are the same product and use the same code, so
  // they aren't distinguishable here (booster is just a half doese).
  [normalizeNdc("80777-0273-10")]: VaccineProduct.moderna, // use
  [normalizeNdc("80777-0273-15")]: VaccineProduct.moderna, // use
  [normalizeNdc("80777-0273-98")]: VaccineProduct.moderna, // sale
  [normalizeNdc("80777-0273-99")]: VaccineProduct.moderna, // sale

  [normalizeNdc("80777-0277-05")]: VaccineProduct.modernaAge6_11, // use
  [normalizeNdc("80777-0277-99")]: VaccineProduct.modernaAge6_11, // sale

  [normalizeNdc("80777-0279-05")]: VaccineProduct.modernaAge0_5, // use
  [normalizeNdc("80777-0279-99")]: VaccineProduct.modernaAge0_5, // sale

  [normalizeNdc("49281-0618-78")]: VaccineProduct.sanofi, // use
  [normalizeNdc("49281-0618-20")]: VaccineProduct.sanofi, // sale
};

function normalizeNdc(ndcCode) {
  // Note: this normalization makes consistent string values, not NDCs
  const parsed = ndcCode.match(/^(\d+)-(\d+)-(\d+)$/);
  if (!parsed) {
    throw new Error(`Unexpected NDC format '${ndcCode}'`);
  }
  return parsed
    .slice(1)
    .map((n) => parseInt(n, 10).toString())
    .join("~");
}

function getProductType(product) {
  const found = ndcLookup[normalizeNdc(product.ndc)];
  if (!found) {
    throw new Error(
      `Unexpected product NDC '${product.ndc}' (${JSON.stringify(product)})`
    );
  }
  return found;
}

/**
 * Get the vaccines that may be in stock at a given location. This includes
 * vaccine products where the stock level is unknown or unreported.
 * @param {Array} products
 * @returns {Array<string>}
 */
function formatProductTypes(products) {
  const result = [
    ...new Set(
      products.filter((p) => isInStock(p) !== Available.no).map(getProductType)
    ),
  ];
  return result.length ? result : undefined;
}

async function checkAvailability(handler, options) {
  const states = options.states?.split(",").map((state) => state.trim());

  if (!states || !states.length) {
    warn("No states specified for cdcApi");
    return [];
  }

  const checkedAt = new Date().toISOString();
  let results = [];
  for (const state of states) {
    const entriesByStoreId = {};
    for await (const entry of queryState(state)) {
      if (!(entry.provider_location_guid in entriesByStoreId)) {
        entriesByStoreId[entry.provider_location_guid] = [];
      }
      entriesByStoreId[entry.provider_location_guid].push(entry);
    }

    const stores = Object.values(entriesByStoreId);
    const formatted = stores
      .map((store) => formatStore(store, checkedAt))
      .filter(Boolean)
      .map(markUnexpectedCvsIds);

    formatted.forEach((item) => handler(item, { update_location: true }));

    results = results.concat(formatted);
  }

  return results;
}

// 18 locations we don't have from the official CVS API that need special treatment
// read more here: https://github.com/usdigitalresponse/univaf/pull/312#pullrequestreview-726002380
const unexpectedCvsIds = new Set([
  "cvs:9773",
  "cvs:9621",
  "cvs:9541",
  "cvs:3428",
  "cvs:5627",
  "cvs:5646",
  "cvs:4592",
  "cvs:8699",
  "cvs:8194",
  "cvs:8210",
  "cvs:8214",
  "cvs:8916",
  "cvs:739",
  "cvs:6006",
  "cvs:2972",
  "cvs:558",
  "cvs:1883",
  "cvs:7386",
]);

function markUnexpectedCvsIds(store) {
  // mutates stores that match above list to hide them and add an internal note
  for (const [system, value] of store.external_ids) {
    if (unexpectedCvsIds.has(`${system}:${value}`)) {
      store.is_public = false;
      store.internal_notes = oneLine`
        Exists in CDC open data but not in CVS APIs;
        this location is probably not actually administering vaccines.
      `;
    }
  }
  return store;
}

module.exports = {
  API_HOST,
  API_PATH,
  checkAvailability,
  queryState,
  formatStore,
};
