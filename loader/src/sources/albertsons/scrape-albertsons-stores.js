/**
 * THIS IS A STANDALONE COMMAND and is not integrated with the rest of
 * univaf-loader. You should run it directly:
 *
 *     # All Albertsons sub-brands:
 *     node scrape-albertsons-stores.js > data.json
 *
 *     # Or specific sub-brands:
 *     node scrape-albertsons-stores.js acmemarkets.com safeway.com > data.json
 *
 * This scrapes an Albertsons sub-brand website for raw data about all known
 * pharmacy locations. It so happens that all the sub-brands seem to be running
 * the same code, and follow a nice and predictable setup for browsing a list
 * of all pharmacies.
 *
 * The pharmacy location pages start with a page that lists links to each state
 * there are stores in. The pages it links to list links to each city there
 * are stores in. Finally, each of *those* pages link to a listing for the
 * individual store, and that page has huge amount of detailed data in a JS
 * object on the page (looks to be intended for Yext indexing).
 *
 * This script outputs that JS object as JSON for each location.
 */

const assert = require("node:assert/strict");
const timers = require("node:timers/promises");
const puppeteer = require("puppeteer");

// Time to wait between page loads (milliseconds).
const navigationInterval = 500;

// Time to wait between crawling each brand (milliseconds).
const brandInterval = 30_000;

// Based on https://www.albertsonscompanies.com/home/default.aspx
const brandUrls = [
  "acmemarkets.com",
  "albertsons.com",
  "albertsonsmarket.com",
  "amigosunited.com",
  "carrsqc.com",
  "jewelosco.com",
  "luckylowprices.com",
  "marketstreetunited.com",
  "pavilions.com",
  "randalls.com",
  "safeway.com",
  "shaws.com",
  "starmarket.com",
  "tomthumb.com",
  "unitedsupermarkets.com",
  "vons.com",

  // No pharmacy pages for these stores.
  // "andronicos.com",
  // "balduccis.com",
  // "haggen.com",
  // "kingsfoodmarkets.com",
];

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

/**
 * Crawl the website for a single Albertsons sub-brand, yielding the data
 * object for each pharmacy location found.
 * @param {puppeteer.Browser} browser
 * @param {string} brandHost
 * @param {number[]} [startIndexes]
 * @yields {any}
 */
async function* crawlBrand(browser, brandHost, startIndexes = []) {
  console.error(`Crawling ${brandHost}...`);

  const page = await browser.newPage();
  const statesListUrl = `https://local.pharmacy.${brandHost}`;
  yield* crawlListingPage(page, statesListUrl, 0, startIndexes);
}

/**
 * Crawl all the links on a listing page and its sub-pages, yielding the data
 * object for each pharmacy location found.
 * @param {puppeteer.Page} page
 * @param {string} pageUrl
 * @param {number} [depth] Indicates the current recursion depth.
 * @param {number[]} [startIndexes] Start with the link at a given index on this
 *        page and its sub-pages.
 * @yields {any}
 */
async function* crawlListingPage(page, pageUrl, depth = 0, startIndexes = []) {
  if (depth > 4) throw new Error(`Too many listing pages deep: "${pageUrl}"`);

  await navigate(page, pageUrl);

  // If the state only has one store, this will actually be a store page.
  const locationData = await getLocationDataFromPage(page);
  if (locationData) {
    yield locationData;
    return;
  }

  let urls = [];
  if (await page.$(".Directory-listLinks")) {
    const list = await selectOnly(page, ".Directory-listLinks");
    urls = await list.$$eval("a.Directory-listLink", (nodes) =>
      nodes.map((n) => n.href)
    );
  } else if (await page.$(".Directory-listTeasers")) {
    const list = await selectOnly(page, ".Directory-listTeasers");
    urls = await list.$$eval(".Teaser a.Teaser-titleLink", (nodes) =>
      nodes.map((n) => n.href)
    );
  } else {
    throw new Error(`Unkown type of listing page: ${pageUrl}`);
  }
  // console.error(urls);
  const startIndex = startIndexes[0] || 0;
  if (startIndex > 0) urls = urls.slice(startIndex);

  for (const url of urls) {
    // results.push(...await crawlCity(page, url));
    yield* crawlListingPage(page, url, depth + 1, startIndexes.slice(1));
  }
}

/**
 * Get the pharmacy data from the page, if present.
 * @param {puppeteer.Page} page
 * @returns {Promise<any>}
 */
async function getLocationDataFromPage(page) {
  // eslint-disable-next-line no-undef
  return await page.evaluate(() => window.Yext?.Profile);
}

/** Start the script! */
async function main(args) {
  let brands = [...brandUrls];
  if (args.length) {
    brands = args.map((x) => x.trim());
  }

  let count = 0;
  for (const brandUrl of brands) {
    if (count > 1) {
      await timers.setTimeout(brandInterval);
    }

    const browser = await puppeteer.launch({
      headless: !process.env.DEBUG,
      args: ["--no-sandbox"],
    });

    let brandCount = 0;
    for await (const location of crawlBrand(browser, brandUrl)) {
      console.log(JSON.stringify(location));
      brandCount++;
      count++;
    }
    console.error(`Crawled ${brandCount} locations from ${brandUrl}`);

    browser.close();
  }
  console.error(
    `Crawled ${count} total locations from ${JSON.stringify(brands)}`
  );
}

main(process.argv.slice(2));
