/**
 * WARNING: THIS LOADER IS DEPRECATED AND NO LONGER IN ACTIVE USE.
 *
 * Scrape appointment availability from CVS's website.
 * Note this scraper was originally focused only on the state of New Jersey,
 * and has not been used in expanded capacity nationwide (it would probably
 * need lots of updates to do so).
 */

const timers = require("node:timers/promises");
const knownStores = require("./known-stores");
const { Logger } = require("../../logging");
const { httpClient, randomInt, randomUserAgent } = require("../../utils");
const { LocationType, Available } = require("../../model");
const {
  CVS_BOOKING_URL,
  CVS_CORPORATE_PHARMACY_PHONE_NUMBER,
  getStoreCounty,
} = require("./shared");

const logger = new Logger("cvsScraper");

// The zip code selected are reverse engineered based on CVS' advertised
// vaccine location. The city/town with CVS that provides that provide COVID
// vaccine can be retrieved from
// https://www.cvs.com/immunizations/covid-19-vaccine.vaccine-status.NJ.json?vaccineinfo=
//
// The list of town/city is converted to zip code to satisfy the getIMZStores API.
// With the zip code, we get all all the detailed store information. It is
// slightly round-about and can be optimized.
const njClinicZip = [
  // brigantine, NJ
  "08203",
  // browns mills, NJ
  "08015",
  // cedar grove, NJ
  "07009",
  // chatham, NJ
  "07928",
  // dumont, NJ
  "07628",
  // east brunswick, NJ
  "08816",
  // edison, NJ
  "08817",
  "08818",
  "08820",
  "08837",
  "08899",
  "08906",
  // elizabeth, NJ
  "07201",
  "07202",
  "07206",
  "07207",
  "07208",
  "08348",
  // englewood, NJ
  "07631",
  "07632",
  "07666",
  // ewing, NJ
  "08560",
  "08618",
  "08628",
  "08638",
  // flemington, NJ
  "08822",
  // green brook, NJ
  "08812",
  // gibbsboro, NJ
  "08026",
  // glassboro, NJ
  "08028",
  // hackettstown, NJ
  "07840",
  // harrison township, NJ
  "08062",
  // hazlet, NJ
  "07730",
  "07734",
  // highlands, NJ
  "07716",
  "07732",
  "08201",
  // lawrenceville, NJ
  "08648",
  // ledgewood, NJ
  "07852",
  // lodi, NJ
  "07644",
  // long branch, NJ
  "07740",
  "07764",
  // north brunswick, NJ
  "08902",
  // north plainfield, NJ
  "07060",
  "07062",
  "07063",
  // northvale, NJ
  "07647",
  // pennsauken, NJ
  "08109",
  "08110",
  // plainsboro, NJ
  "08536",
  // princeton, NJ
  "08540",
  "08541",
  "08542",
  "08543",
  "08544",
  "08550",
  // ringwood, NJ
  "07456",
  // seaside heights, NJ
  "08751",
  // tabernacle, NJ
  "08088",
  // teaneck, NJ
  "07666",
  // union, NJ
  "07016",
  "07023",
  "07027",
  "07033",
  "07036",
  "07060",
  "07061",
  "07062",
  "07063",
  "07065",
  "07066",
  "07076",
  "07081",
  "07083",
  "07087",
  "07088",
  "07090",
  "07091",
  "07092",
  "07201",
  "07202",
  "07203",
  "07204",
  "07205",
  "07206",
  "07207",
  "07208",
  "07735",
  "07901",
  "07902",
  "07922",
  "07974",
  "08812",
  // union city, NJ
  "07087",
  // vernon, NJ
  "07462",
  "07976",
  // villas, NJ
  "08251",
  // vineland, NJ
  "08360",
  "08361",
  "08362",
  // voorhees, NJ
  "08043",
  // west orange, NJ
  "07052",
  // whiting, NJ
  "08759",
  // willingboro, NJ
  "08046",
];

/**
 * Given an "address" string, invoke the CVS getIMZStores API.
 *
 * @param {string} address
 * Address is a freeform item that satisfy the `searchCriteria: { addressLine: address }`
 * field. Based on experiment, addressLine can be city, county, town, or zipcode.
 * However, zipcode appears to be the most reliable in terms of results.
 * (more experiment needed).
 */
async function queryClinic(address) {
  const opt = {
    url: "https://www.cvs.com/Services/ICEAGPV1/immunization/1.0.0/getIMZStores",
    method: "POST",
    headers: {
      Origin: "https://www.cvs.com",
      Referer:
        "https://www.cvs.com/vaccine/intake/store/cvd-store-select/first-dose-select",
      TE: "Trailers",
      "User-Agent": randomUserAgent(),
    },
    json: {
      requestMetaData: {
        appName: "CVS_WEB",
        lineOfBusiness: "RETAIL",
        channelName: "WEB",
        deviceType: "DESKTOP",
        deviceToken: "7777",
        apiKey: "a2ff75c6-2da7-4299-929d-d670d827ab4a",
        source: "ICE_WEB",
        securityType: "apiKey",
        responseFormat: "JSON",
        type: "cn-dep",
      },
      requestPayloadData: {
        selectedImmunization: ["CVD"],
        distanceInMiles: 25,
        imzData: [{ imzType: "CVD", allocationType: "1" }],
        searchCriteria: { addressLine: address },
      },
    },
  };

  try {
    const response = await httpClient(opt).json();
    if (response.responseMetaData.statusCode !== "1010") {
      // Note to future readers: Please do not blindly delete these
      // log lines.
      //
      // We are still reverse-engineering the CVS data format,
      // especially details of the response in the (rare) case where
      // there is availability, and so we rely on having a log of what
      // we actually observed in production in order to refine this
      // scraper.
      //
      // For now, check with Alan (github @askldjd) when making
      // changes to these.
      logger.info(`found results at ${address}`);
      logger.info(JSON.stringify(response, null, 2));
      return response;
    } else {
      logger.error("CVS Scraper: nothing found at zip", address);
    }
  } catch (err) {
    logger.error(`Error scraping CVS in '${address}':`, err);
  }
  return null;
}

/**
 * Helper method to convert the CVS result to the scraper schema.
 * This way, the data output is standardized across all modules.
 *
 * @param {object} cvsResult CVS results from one zip code. Should be the fully
 *        decoded JSON response from getIMZStores.
 * @returns object
 */
function convertToStandardSchema(cvsResult) {
  if (cvsResult.responseMetaData.statusCode !== "0000") return;

  const nowStr = new Date().toISOString();
  const standardResults = {};
  cvsResult.responsePayloadData.locations.forEach((location) => {
    if (location.addressState.toLowerCase() !== "nj") {
      // Query by zip code with `distanceInMile == 25` allows other state
      // results to come through. We need to do another layer of filtering.
      return;
    }

    const addressString = `${location.addressLine}, ${location.addressCityDescriptionText}, ${location.addressState} ${location.addressZipCode}`;

    const county = getStoreCounty(location.StoreNumber);
    if (!county) {
      // Ignore the store if it is not in our list. We need to log it out
      // and possibly update our result list.
      logger.warn(
        `CVS store ${location.StoreNumber} at ${addressString} is not in known store list, ignoring`
      );
      return;
    }

    standardResults[location.StoreNumber] = {
      id: `CVS:${location.StoreNumber}`,
      name: `CVS #${location.StoreNumber}`,
      external_ids: { cvs: location.StoreNumber },
      provider: "cvs",
      location_type: LocationType.pharmacy,

      address_lines: [location.addressLine],
      city: location.addressCityDescriptionText,
      state: location.addressState,
      postal_code: location.addressZipCode,

      county,
      position: null,
      booking_phone: CVS_CORPORATE_PHARMACY_PHONE_NUMBER,
      booking_url: CVS_BOOKING_URL,

      availability: {
        source: "univaf-cvs-scraper",
        valid_at: nowStr,
        checked_at: nowStr,
        available: Available.yes,
      },
    };
  });

  return standardResults;
}

/**
 * Fill in canned data for all CVS stores in NJ. This way we can return a
 * consistent JSON object for stores that does not have vaccine.
 *
 * @return Object in format of
 * { storeNumber : { standard schema block } }
 *
 */
function createCannedUnavailableStore() {
  const nowStr = new Date().toISOString();
  const fillerResults = {};

  // knownStores includes some locations not in NJ, but all the locations in it
  // follow a standard address format ending in "<state> <zip>".
  const njAddressPattern = /\bNJ\s+\d{5}$/;
  for (const [storeNumber, store] of Object.entries(knownStores)) {
    if (njAddressPattern.test(store.address)) {
      fillerResults[storeNumber] = {
        id: `CVS:${storeNumber}`,
        name: `CVS #${storeNumber}`,
        external_ids: { cvs: storeNumber },
        provider: "cvs",
        location_type: LocationType.pharmacy,

        // TODO: parse the address to get city and postal code.
        address_lines: [store.address],
        city: null,
        state: "NJ",
        postal_code: store.zip,

        county: getStoreCounty(storeNumber),
        position: null,
        booking_phone: CVS_CORPORATE_PHARMACY_PHONE_NUMBER,
        booking_url: CVS_BOOKING_URL,

        availability: {
          source: "univaf-cvs-scraper",
          valid_at: nowStr,
          checked_at: nowStr,
          available: Available.no,
        },
      };
    }
  }

  return fillerResults;
}

/**
 * Kick off the scraper to crawl the getIMZStores endpoint.
 *
 * @return {Promise<Array>} Array of results conforming to the scraper standard.
 */
async function* checkAvailability(_options) {
  logger.warn("DEPRECATED: cvsScraper is no longer maintained.");

  const clinicsZip = njClinicZip;

  const standardResults = {};
  for (let i = 0; i < clinicsZip.length; i += 1) {
    const rawResults = await queryClinic(clinicsZip[i].toString());
    if (rawResults) {
      const clinicResults = convertToStandardSchema(rawResults);
      Object.assign(standardResults, clinicResults);
      for (const clinic of Object.values(clinicResults)) {
        yield [clinic];
      }
    }

    await timers.setTimeout(randomInt(3, 7) * 1000);
  }

  const finalResult = { ...createCannedUnavailableStore() };
  for (const storeNumber in standardResults) {
    finalResult[storeNumber] = standardResults[storeNumber];
  }

  for (const store of Object.values(finalResult)) {
    if (store.availability.available === Available.no) {
      yield [store];
    }
  }

  return Object.values(finalResult);
}

module.exports = { checkAvailability };

// Allow extra functions to be exported in the test environment.
if (process.env.NODE_ENV === "test") {
  Object.assign(module.exports, {
    convertToStandardSchema,
    createCannedUnavailableStore,
    njClinicZip,
  });
}
