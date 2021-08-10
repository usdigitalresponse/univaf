const Sentry = require("@sentry/node");
const got = require("got");

const { Available } = require("../../model");
const { titleCase } = require("../../utils");

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
      const response = await got({
        url: `https://data.cdc.gov/resource/5jp2-pgaw.json?$limit=${PAGE_SIZE}&$offset=${offset}&loc_admin_state=${state}`,
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
        available_count: getAvailableCount(productList),
        available: formatAvailable(productList),
        products: formatProductTypes(productList),
      },
    };

    if (base.longitude && base.latitude) {
      result.position = {
        longitude: base.longitude,
        latitude: base.latitude,
      };
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

function formatValidAt(products) {
  const dates = products.map((p) => p.quantity_last_updated);
  dates.sort();
  return dates[dates.length - 1];
}

function getAvailableCount(products) {
  if (!Array.isArray(products)) {
    products = [products];
  }

  let sum = 0;
  for (const product of products) {
    const supplyLevel = parseInt(product.supply_level, 10);
    if (supplyLevel > 0) {
      sum += supplyLevel;
    } else {
      sum += product.in_stock ? 1 : 0;
    }
  }
  return sum;
}

function formatAvailable(products) {
  return getAvailableCount(products) > 0 ? Available.yes : Available.no;
}

const ndcLookup = {
  // from https://www.cdc.gov/vaccines/programs/iis/COVID-19-related-codes.html
  // and https://www2a.cdc.gov/vaccines/iis/iisstandards/vaccines.asp?rpt=ndc
  [normalizeNdc("00310-1222-10")]: "astra_zeneca", //use
  [normalizeNdc("00310-1222-15")]: "astra_zeneca", //sale
  [normalizeNdc("59267-1000-01")]: "pfizer", //use
  [normalizeNdc("59267-1000-02")]: "pfizer", //sale
  [normalizeNdc("59267-1000-03")]: "pfizer", //sale
  [normalizeNdc("59676-0580-05")]: "jj", //use
  [normalizeNdc("59676-0580-15")]: "jj", //sale
  [normalizeNdc("80631-0100-01")]: "novavax", //sale
  [normalizeNdc("80631-0100-10")]: "novavax", //use
  [normalizeNdc("80777-0273-10")]: "moderna", // use
  [normalizeNdc("80777-0273-15")]: "moderna", // use
  [normalizeNdc("80777-0273-98")]: "moderna", //sale
  [normalizeNdc("80777-0273-99")]: "moderna", //sale
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

function formatProductTypes(products) {
  return [...new Set(products.map((p) => getProductType(p)))];
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
      .map(markUnexpectedCVSs)
      .forEach((item) => handler(item, { update_location: true }));

    results = results.concat(formatted);
  }

  return results;
}

// 18 locations we don't have from the official CVS API that need special treatment
// read more here: https://github.com/usdigitalresponse/univaf/pull/312#pullrequestreview-726002380
const unexpectedCVSs = new Set([
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

function markUnexpectedCVSs(store) {
  // mutates stores that match above list to hide them and add an internal note
  for (const [system, value] of store.external_ids) {
    if (unexpectedCVSs.has(`${system}:${value}`)) {
      store.is_public = false;
      store.internal_notes =
        "Exists in CDC open data but not in CVS APIs; " +
        "this location is probably not actually administering vaccines.";
    }
  }
  return store;
}

module.exports = {
  checkAvailability,
};
