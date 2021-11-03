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
const { httpClient, oneLine, titleCase } = require("../../utils");

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

function formatStore(storeItems) {
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

    const storeExternalId = getStoreExternalId(base);
    if (!storeExternalId) {
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
        storeExternalId,
      ],
      name: titleCase(base.loc_name),
      provider: storeExternalId[0],
      address_lines: addressLines,
      city: titleCase(base.loc_admin_city),
      state: base.loc_admin_state,
      postal_code: base.loc_admin_zip,
      info_phone: base.loc_phone,
      info_url: base.web_address,
      meta,

      availability: {
        source: "cdc",
        checked_at: new Date().toISOString(),
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
      if (isNaN(position.longitude) || isNaN(position.longitude)) {
        error("longitude and latitude are not numbers");
      } else {
        result.position = position;
      }
    }
  });
  return result;
}

const systemNameRe = {
  costco: /^Costco/i,
  cvs: /^CVS/i,
  kroger: /^Kroger/i,
  publix: /^Publix/i,
  rite_aid: /^Rite Aid/i,
  safeway: /^SAFEWAY/i,
  sams_club: /^Sams Club/i,
  walgreens: /^Walgreens/i,
  walmart: /^Walmart/i,
};

function getStoreExternalId(store) {
  // handle numeric store numbers
  let m = store.loc_store_no.match(/^(?<storeNo>\d+)$/);

  if (!m) {
    // handle vtrcks pins like RA105587 -> 5587 in addition to pure numeric store numbers
    m = store.loc_store_no.match(/^([A-Z]{3}|[A-Z]{2}\d)(?<storeNo>\d{5})/i);
  }

  if (!m) {
    return null;
  }
  const storeNumber = parseInt(m.groups.storeNo, 10).toString();

  for (const system in systemNameRe) {
    if (store.loc_name.match(systemNameRe[system])) {
      return [system, storeNumber];
    }
  }
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
  [normalizeNdc("59267-1000-01")]: VaccineProduct.pfizer, // use
  [normalizeNdc("59267-1000-02")]: VaccineProduct.pfizer, // sale
  [normalizeNdc("59267-1000-03")]: VaccineProduct.pfizer, // sale
  [normalizeNdc("59267-1025-01")]: VaccineProduct.pfizer, // use
  [normalizeNdc("59267-1025-02")]: VaccineProduct.pfizer, // sale
  [normalizeNdc("59267-1025-03")]: VaccineProduct.pfizer, // sale
  [normalizeNdc("59267-1025-04")]: VaccineProduct.pfizer, // sale
  [normalizeNdc("00069-1000-01")]: VaccineProduct.pfizer, // use
  [normalizeNdc("00069-1000-02")]: VaccineProduct.pfizer, // sale
  [normalizeNdc("00069-1000-03")]: VaccineProduct.pfizer, // sale
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
  [normalizeNdc("80777-0273-10")]: VaccineProduct.moderna, // use
  [normalizeNdc("80777-0273-15")]: VaccineProduct.moderna, // use
  [normalizeNdc("80777-0273-98")]: VaccineProduct.moderna, // sale
  [normalizeNdc("80777-0273-99")]: VaccineProduct.moderna, // sale
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
      .map(formatStore)
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
};
