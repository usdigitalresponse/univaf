/**
 * THIS IS A STANDALONE COMMAND and is not integrated with the rest of
 * univaf-loader. You should run it directly:
 *
 *     node scrape-cvs-stores.js > data.json
 *
 * This scrapes CVS's website for raw data about all known pharmacy locations.
 */

const assert = require("node:assert/strict");
const { parseArgs } = require("node:util");
const { httpClient, RateLimit } = require("../utils");
const { assertSchema } = require("../schema-validation");

// FIXME: Ruler is different: https://rulerfoods.com/locations/

// NOTE: The Little Clinic shows up a department (code: 56) in other stores.
// BUT the two (the store and the little clinic) have different location IDs,
// and I can't see a way to get the little clinic ones from the store it's in.
// You can also search for them separately...
//   Browser: https://www.kroger.com/health-services/clinic/locations?searchText=30601
//   JSON:    https://www.kroger.com/appointment-management/v1/clinics?filter.businessName=tlc&filter.reasonId=29&filter.freeFormAddress=30601&filter.maxResults=50&page.size=4

const brandHosts = {
  kroger: "https://www.kroger.com",
  fredmeyer: "https://www.fredmeyer.com",
  bakers: "https://www.bakersplus.com/",
  citymarket: "https://www.citymarket.com/",
  dillons: "https://www.dillons.com/",
  food4less: "https://www.food4less.com/",
  foodsco: "https://www.foodsco.net/",
  frys: "https://www.frysfood.com/",
  gerbes: "https://www.gerbes.com/",
  harristeeter: "https://www.harristeeter.com/",
  jayc: "https://www.jaycfoods.com/",
  kingsoopers: "https://www.kingsoopers.com/",
  marianos: "https://www.marianos.com/",
  metromarket: "https://www.metromarket.net/",
  payless: "https://www.pay-less.com/",
  picknsave: "https://www.picknsave.com/",
  qfc: "https://www.qfc.com/",
  ralphs: "https://www.ralphs.com/",
  smiths: "https://www.smithsfoodanddrug.com/",
};

async function makeRequest(options) {
  try {
    return await httpClient(options);
  } catch (error) {
    let annotations = "";
    if (error.response) {
      annotations = ` (status: ${error.response.statusCode})`;
    }
    throw new Error(`HTTP Error requesting "${options.url}"${annotations}`, {
      cause: error,
    });
  }
}

const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/113.0";

async function* crawlBrand({ brand, states }) {
  const host = brandHosts[brand];
  assert.ok(host, `Could not find brand: "${brand}"`);

  const allIds = await getLocationIds(host, "grocery", states);
  const pharmacyIds = await getLocationIds(host, "pharmacy", states);
  for (const [state, storeIds] of Object.entries(pharmacyIds)) {
    const stateGroceries = allIds[state];
    for (const id of storeIds) {
      if (!stateGroceries.includes(id)) {
        console.warn(
          `Found pharmacy that is not in a grocery! State: ${state}, ID: ${id}`
        );
        stateGroceries.push(id);
      }
    }
  }

  const rateLimit = new RateLimit(2);
  for (const [state, storeIds] of Object.entries(allIds)) {
    console.warn(`Getting stores in ${state.toUpperCase()}...`);
    const batchSize = 20;
    for (let i = 0; i < storeIds.length; i += batchSize) {
      const batch = storeIds.slice(i, i + batchSize);
      await rateLimit.ready();
      const { body: stores } = await makeRequest({
        url: new URL(`/atlas/v1/stores/v2/locator`, host).href,
        searchParams: new URLSearchParams([
          ["projections", "full"],
          ...batch.map((id) => ["filter.locationIds", id]),
        ]),
        headers: { "User-Agent": userAgent },
        responseType: "json",
      });

      assertSchema(
        {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                stores: {
                  type: "array",
                  items: { type: "object" },
                },
              },
            },
          },
        },
        stores
      );

      for (const store of stores.data.stores) {
        yield store;
      }
    }
  }
}

/**
 *
 * @param {string} host
 * @param {"grocery"|"pharmacy"} type
 * @param {string[]} [states]
 * @returns {{[index string]: string[]}}
 */
async function getLocationIds(host, type, states = null) {
  const rateLimit = new RateLimit(5);

  /** @type {{[index string]: string[]}} */
  const result = {};

  await rateLimit.ready();
  const cityListUrl = new URL(
    `/seo-store-files/link-hub/store-details-categories/${type}-stores.json`,
    host
  ).href;
  const { body: directory } = await makeRequest({
    url: cityListUrl,
    headers: { "User-Agent": userAgent },
    responseType: "json",
  });

  assertSchema(
    {
      type: "object",
      properties: {
        meta: {
          type: "object",
          properties: {
            storesCount: { type: "number" },
          },
        },
        data: {
          type: "object",
          patternProperties: {
            "^[A-Za-z\\s]*$": {
              type: "object",
              properties: {
                keyUrl: {
                  type: "string",
                  pattern: `^/stores/${type}/([a-z]{2})$`,
                },
                links: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string" },
                      link: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    directory
  );

  for (const stateDirectory of Object.values(directory.data)) {
    const storeIds = [];
    const stateCode = stateDirectory.keyUrl.match(
      /^\/stores\/(?:grocery|pharmacy)\/([a-z]{2})$/
    )[1];

    if (states && !states.includes(stateCode)) continue;

    for (const city of stateDirectory.links) {
      const citySlug = city.text
        .toLowerCase()
        .replace(/\s/g, "-")
        .replace(/\./g, "");
      await rateLimit.ready();
      const { body: cityStores } = await makeRequest({
        url: new URL(
          `/seo-store-files/link-hub/store-details-cities/${citySlug}-${stateCode}-${type}.json`,
          host
        ).href,
        headers: { "User-Agent": userAgent },
        responseType: "json",
      });

      assertSchema(
        {
          type: "object",
          properties: {
            locationIds: {
              type: "array",
              items: {
                type: "string",
                pattern: "^\\d+$",
              },
            },
          },
        },
        cityStores
      );

      storeIds.push(...cityStores.locationIds);
    }

    result[stateCode] = storeIds;
  }

  return result;
}

/** Start the script! */
async function main(args) {
  const parseStringArray = (value) => value?.split(",")?.map((s) => s.trim());
  const brands =
    parseStringArray(args.values["brands"]) || Object.keys(brandHosts);
  const states = parseStringArray(args.values["states"]);

  let count = 0;
  for (const brand of brands) {
    console.error(`Crawling brand: ${brand}...`);
    for await (const location of crawlBrand({
      brand,
      states,
    })) {
      console.log(JSON.stringify(location));
      count++;
    }
  }
  console.error(`Crawled ${count} total locations`);
}

module.exports = { main };

if (require.main === module) {
  // main(process.argv.slice(2));
  main(
    parseArgs({
      options: {
        brands: { type: "string" },
        states: { type: "string" },
      },
    })
  );
}
