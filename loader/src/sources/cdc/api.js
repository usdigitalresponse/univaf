const Sentry = require("@sentry/node");
const got = require("got");

const { Available, LocationType } = require("../../model");
const { titleCase } = require("../../utils");

function warn(message, context) {
  console.warn(`VTS Geo: ${message}`, context);
  Sentry.captureMessage(message, Sentry.Severity.Info);
}

function error(message, context) {
  console.error(`VTS Geo: ${message}`, context);
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

      for (result of results) {
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

    const addressLines = [
      base.loc_admin_street1,
      base.loc_admin_street2,
    ].filter(Boolean);

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
      id: `cdc:${base.provider_location_guid}`,
      external_ids: ["vaccines_gov", base.provider_location_guid], // XXX what's the right id to send here?
      name: titleCase(base.loc_name),
      provider: "cdc",

      address_lines: addressLines,
      city: base.loc_admin_city,
      state: base.loc_admin_state,
      postal_code: base.loc_admin_zip,
      position: {
        longitude: base.longitude,
        latitude: base.latitude,
      },
      info_phone: base.loc_phone,
      info_url: base.web_address,
      meta,

      availability: {
        source: "cdc",
        checked_at: new Date().toISOString(),
        valid_at: formatValidAt(productList),
        available_count: getAvailableCount(productList),
        available: formatAvailable(productList),
        capacity: formatCapacity(productList),
        products: formatProducts(productList),
        // XXX should doses be here?
      },
    };
  });
  return result;
}

function formatValidAt(products) {
  const dates = products.map((p) => p.quantity_last_updated);
  dates.sort();
  return dates[dates.length - 1];
}

function getAvailableCount(products) {
  let sum = 0;
  for (const product of products) {
    sum += parseInt(product.supply_level, 10);
  }
  return sum;
}

function formatAvailable(products) {
  return getAvailableCount(products) > 0 ? Available.yes : Available.no;
}

function formatProducts(products) {
  [...new Set(products.map((p) => p.med_name))];
}

function formatCapacity(products) {
  return products.map((product) => {
    const availableCount = parseInt(product.supply_level, 10);
    return {
      products: [product.med_name],
      date: product.quantity_last_updated,
      available: availableCount > 0 ? Available.yes : Available.no,
      available_count: availableCount,
    };
  });
}

async function checkAvailability(handler, options) {
  handler = (thing) => console.log(JSON.stringify(thing));
  const states = options.states?.split(",").map((state) => state.trim());

  if (!states || !states.length) {
    warn("No states specified for cdcApi");
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
      .forEach((item) => handler(item, { update_location: true }));

    results = results.concat(formatted);
  }

  return results;
}

module.exports = {
  checkAvailability,
};
