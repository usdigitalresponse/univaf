/**
 * THIS IS A STANDALONE COMMAND and is not integrated with the rest of
 * univaf-loader. You should run it directly:
 *
 *     node scrape-cvs-stores.js > data.json
 *
 * This scrapes CVS's website for raw data about all known pharmacy locations.
 */

const assert = require("node:assert/strict");
const timers = require("node:timers/promises");
const { parseArgs } = require("node:util");
const puppeteer = require("puppeteer");
const { assertSchema } = require("../../schema-validation");

const debugMode = process.env.DEBUG;

// Time to wait between page loads (milliseconds).
const navigationInterval = 250;

const navigationTimeoutRetryDelay = 30_000;

const rootUrl = "https://www.cvs.com/store-locator/cvs-pharmacy-locations";

let lastNavigation = 0;

/**
 * Navigate a Puppeteer page to a new URL. This adds some basic settings and
 * enforces minimum delays between page loads.
 * @param {puppeteer.Page} page
 * @param {string} url
 * @param {any} options
 */
async function navigate(page, url, options) {
  if (!options) options = { waitUntil: "networkidle2" };
  if (options.timeout == null) options.timeout = 30_000;

  const elapsed = Date.now() - lastNavigation;
  if (elapsed < navigationInterval) {
    await timers.setTimeout(navigationInterval - elapsed);
  }
  await page.goto(url, options);
  lastNavigation = Date.now();
}

let currentBrowser = null;
let currentPage = null;
async function withPage(options, callback) {
  if (!callback && typeof options === "function") {
    callback = options;
    options = undefined;
  }

  let triesLeft = (options?.retries ?? 0) + 1;
  while (triesLeft > 0) {
    triesLeft--;

    if (!currentBrowser) {
      currentBrowser = await puppeteer.launch({
        headless: debugMode ? false : "new",
        args: ["--no-sandbox"],
        ...options?.browser,
      });
      currentPage = null;
    }
    if (!currentPage) {
      currentPage = await currentBrowser.newPage();
    }

    try {
      return await callback(currentPage);
    } catch (error) {
      let retry = false;
      const message = error?.message?.toLowerCase();
      if (
        message?.includes("target closed") ||
        message?.includes("browser has disconnected")
      ) {
        console.error("Browser crashed");
        currentBrowser = null;
        currentPage = null;
        retry = triesLeft > 0;
      }
      if (message?.includes("navigation timeout")) {
        console.error("Navigation timed out");
        await currentPage.close();
        currentPage = null;
        retry = triesLeft > 0;
        if (retry) {
          console.error(
            `Pausing for ${navigationTimeoutRetryDelay} ms before retrying...`
          );
          await timers.setTimeout(navigationTimeoutRetryDelay);
        }
      }
      if (!retry) {
        throw error;
      }
    }
  }
}

async function closeBrowser() {
  if (currentBrowser) await currentBrowser.close();

  currentBrowser = null;
  currentPage = null;
}

/**
 * Select a single element from the page, and assert that the given selector
 * ONLY matches one element.
 * @param {puppeteer.Page} page
 * @param {string} selector
 * @returns {puppeteer.ElementHandle}
 */
async function selectOnly(page, selector) {
  const elements = await page.$$(selector);
  assert.equal(elements.length, 1, `There should only be one "${selector}"`);
  return elements[0];
}

async function* crawlCvs({
  includeStates = null,
  excludeStates = null,
  startCity = null,
} = {}) {
  let states = await getStateList();
  states = states
    .sort((a, b) => (a.stateCode < b.stateCode ? -1 : 1))
    .filter((state) => includeStates?.includes(state.stateCode) ?? true)
    .filter((state) => !excludeStates?.includes(state.stateCode));

  for (const state of states) {
    let cities = await getCityList(state.stateName);
    cities = cities.sort((a, b) => (a.cityName < b.cityName ? -1 : 1));

    const total = cities.reduce((t, city) => t + Number(city.storeCount), 0);
    console.warn(`Crawling ${state.stateCode} (${total} cities)...`);

    if (startCity) {
      const skipIndex = cities.findIndex(
        (c) => c.cityName.toLowerCase() === startCity.toLowerCase()
      );
      if (skipIndex > 0) {
        cities = cities.slice(skipIndex);
      } else {
        console.warn(
          `Asked to skip past city "${startCity}", but that city was not found`
        );
      }
      startCity = null;
    }

    for (const city of cities) {
      const stores = await getStoreList(state.stateName, city.cityName);
      yield* stores;
    }
  }
}

/**
 * @returns {Promise<Array<{stateName: string, stateCode: string}>>}
 */
async function getStateList() {
  return await withPage({ retries: 1 }, async (page) => {
    await navigate(page, rootUrl);

    const dataElementSelector = "cvs-store-locator-country-page";
    await selectOnly(page, dataElementSelector);
    const data = await page.$eval(dataElementSelector, (node) =>
      JSON.parse(node.getAttribute("cp-props"))
    );

    assertSchema(
      {
        type: "object",
        properties: {
          stateList: {
            type: "array",
            items: {
              type: "object",
              properties: {
                stateName: { type: "string" },
                stateCode: { type: "string" },
              },
            },
          },
        },
      },
      data
    );

    return data.stateList;
  });
}

/**
 * @param {string} stateName
 * @returns {Promise<Array<{cityName: string, storeCount: string}>>}
 */
async function getCityList(stateName) {
  const stateSlug = stateName.replace(/\s/g, "-");
  const url = `${rootUrl}/${stateSlug}`;

  return await withPage({ retries: 1 }, async (page) => {
    await navigate(page, url);

    const dataElementSelector = "cvs-store-locator-state-page";
    await selectOnly(page, dataElementSelector);
    const data = await page.$eval(dataElementSelector, (node) =>
      JSON.parse(node.getAttribute("state-page-props"))
    );

    assertSchema(
      {
        type: "object",
        properties: {
          cityList: {
            type: "array",
            items: {
              type: "object",
              properties: {
                cityName: { type: "string" },
                storeCount: { type: "string" },
              },
            },
          },
        },
      },
      data
    );

    return data.cityList;
  });
}

/**
 * @param {string} stateName
 * @param {string} cityName
 * @returns {Promise<Array<any>>}
 */
async function getStoreList(stateName, cityName) {
  const stateSlug = stateName.replace(/\s/g, "-");
  const citySlug = cityName.replace(/\s/g, "-");
  const url = `${rootUrl}/${stateSlug}/${citySlug}`;

  return await withPage({ retries: 2 }, async (page) => {
    await navigate(page, url);

    const dataElementSelector = "cvs-store-locator-city-page";
    if (await page.$(dataElementSelector)) {
      return await extractStoresFromListPage(page, dataElementSelector);
    } else {
      return await extractStoresFromDetailsPage(page);
    }
  });
}

async function extractStoresFromListPage(page, dataElementSelector) {
  const data = await page.$eval(dataElementSelector, (node) =>
    JSON.parse(node.getAttribute("slcp-props"))
  );

  assertSchema(
    {
      type: "object",
      properties: {
        storeResult: {
          type: "array",
          items: {
            type: "object",
          },
        },
      },
    },
    data
  );

  return data.storeResult;
}

async function extractStoresFromDetailsPage(page) {
  const props = await page.$eval("cvs-store-details-legacy-page", (node) =>
    JSON.parse(node.getAttribute("sd-props"))
  );

  const meta = await page.$eval(
    "#structured-data-block",
    (node) => JSON.parse(node.innerHTML)[0]
  );

  return [{ detailsPage: { props, meta } }];
}

function parseRaw(raw) {
  if (raw.detailsPage) {
    return parseRawDetails(raw.detailsPage);
  } else {
    return parseRawListing(raw);
  }
}

function parseRawListing(raw) {
  assert.ok(raw.address.firstLine, `Address is missing a firstLine: ${raw}`);
  assert.ok(raw.address.secondLine, `Address is missing a secondLine: ${raw}`);

  const secondLineParts = raw.address.secondLine.match(
    /^\s*(.+)\s*, ([A-Z][A-Z]), (\d{5}(-\d{4})?)$/
  );
  assert.ok(
    secondLineParts,
    `address.secondLine does not match expected pattern: ${raw}`
  );

  const address = {
    // There are often multiple "lines" squeezed into `firstLine`, but I haven't
    // done the work of really mapping out how to safely unpack them. e.g. I'm
    // not certain splitting on ", " is safe. So don't bother.
    lines: [raw.address.firstLine],
    city: secondLineParts[1],
    state: secondLineParts[2],
    zip: secondLineParts[3],
  };

  return {
    rawListing: raw,
    parsed: {
      address,
      phone: raw.phone,
      storeNumber: raw.storeNumber,
      storeUrl: new URL(raw.storeUrl, rootUrl).href,
      position: {
        latitude: raw.mapPin.lat,
        longitude: raw.mapPin.lng,
      },
    },
  };
}

function parseRawDetails(raw) {
  // FIXME: parse raw.props.cvsLocationGeneralDetailsProps.storeAddress
  return {
    rawDetailProps: raw.props,
    rawDetailMeta: raw.meta,
    parsed: {
      address: {
        lines: [raw.props.cvsMyStoreDetailsProps.store.street],
        city: raw.props.cvsMyStoreDetailsProps.store.city,
        state: raw.props.cvsMyStoreDetailsProps.store.state,
        zip: raw.props.cvsMyStoreDetailsProps.store.zip,
      },
      phone: raw.props.cvsLocationGeneralDetailsProps.phoneNumbers[0].pharmacy,
      storeNumber: raw.props.cvsLocationGeneralDetailsProps.storeNumber,
      storeUrl: new URL(raw.meta.url, rootUrl),
      position: {
        latitude: Number(
          raw.props.cvsLocationGeneralDetailsProps.coordinates.lat
        ),
        longitude: Number(
          raw.props.cvsLocationGeneralDetailsProps.coordinates.lng
        ),
      },
    },
  };
}

/** Start the script! */
async function main(args) {
  const parseStringArray = (value) => value?.split(",")?.map((s) => s.trim());
  const options = {
    includeStates: parseStringArray(args.values["include-states"]),
    excludeStates: parseStringArray(args.values["exclude-states"]),
    startCity: args.values["start-city"],
  };

  let count = 0;
  try {
    for await (const location of crawlCvs(options)) {
      console.log(JSON.stringify(location));
      count++;
    }
  } finally {
    if (debugMode) {
      await timers.setTimeout(5 * 60_000);
    }
    await closeBrowser();
  }
  console.error(`Crawled ${count} total locations`);
}

module.exports = { main, parseRaw };

if (require.main === module) {
  // main(process.argv.slice(2));
  main(
    parseArgs({
      options: {
        "include-states": { type: "string" },
        "exclude-states": { type: "string" },
        "start-city": { type: "string" },
      },
    })
  );
}
