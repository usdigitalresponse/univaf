const { Available, LocationType, VaccineProduct } = require("../../model");
const { parseUsAddress, unpadNumber } = require("../../utils");
const csvParse = require("csv-parse/sync");
const getStream = require("get-stream");
const { S3 } = require("@aws-sdk/client-s3");
const { ApiClient } = require("../../api-client");
const {
  matchable,
  matchableAddress,
  oneLine,
  popItem,
  titleCase,
  createWarningLogger,
} = require("../../utils");
const { corrections } = require("./corrections");

const NJVSS_WEBSITE = "https://covidvaccine.nj.gov";
const NJVSS_DATA_REGION = "us-east-1";
const NJVSS_DATA_BUCKET = "njvss-pinpoint-reports";
const NJVSS_DATA_KEY = "njvss-available-appointments.csv";

const PROVIDER = {
  njvss: "njvss",
  sams: "sams_club",
  walmart: "walmart",
};

const VACCINE_NAMES = {
  "Janssen (J&J) (18 and older)": VaccineProduct.janssen,
  "Moderna_Peds_DarkBlueCap (6 - 11 years)": VaccineProduct.modernaAge6_11,
  "Moderna_RedCap (12 and older)": VaccineProduct.moderna,
  "Novavax (12 and older)": VaccineProduct.novavax,
  "Pfizer_GrayCap (12 and older)": VaccineProduct.pfizer,
  "Pfizer_Peds (5 - 11 years)": VaccineProduct.pfizerAge5_11,
  "Pfizer_PurpleCap (12 and older)": VaccineProduct.pfizer,
  "Booster Janssen (J&J) (18 and older)": VaccineProduct.janssen,
  "Booster Moderna_DarkBlueCap (18 and older)": VaccineProduct.modernaBa4Ba5,
  "Booster Pfizer_Peds (5 - 11 years)": VaccineProduct.pfizerAge5_11,
  "Booster Pfizer_PurpleCap (12 and older)": VaccineProduct.pfizer,
  "Moderna_Peds (6 months - 5 years)": VaccineProduct.modernaAge0_5,
  "Moderna_Bivalent (6 months - 5 years)": VaccineProduct.modernaBa4Ba5Age0_5,
  "Pfizer_Peds (6 months - 4 years)": VaccineProduct.pfizerAge0_4,
  "Pfizer_Bivalent (6 months - 4 years)": VaccineProduct.pfizerBa4Ba5Age0_4,
  "Booster Pfizer_GrayCap (12 and older)": VaccineProduct.pfizerBa4Ba5,
  "Booster Moderna_RedCap (18 and older)": VaccineProduct.moderna,
};

const warn = createWarningLogger("njvss");

/**
 * @typedef {Object} NjvssRecord
 * @property {string} res_id
 * @property {number} provider_id
 * @property {string} name
 * @property {string} statuscodename
 * @property {string} vras_provideraddress
 * @property {string} vras_typetext Type of service, usually 'COVID Vaccination'
 * @property {number} vras_latitude
 * @property {number} vras_longitude
 * @property {string} vras_typetext Additional details as an HTML string.
 * @property {boolean?} vras_allowschedulingforcountyresidentsonly Whether
 *           scheduling is allowed only for county residents. May be `null` if
 *           unknown.
 * @property {string} county
 * @property {number} available Number of available appointment slots
 */

/**
 * Parse a boolean value from a string in NJVSS data. May return `null`.
 * @param {string} text
 * @returns {boolean?}
 */
function parseBooleanText(text) {
  const clean = text.trim().toLowerCase();
  return clean === "true" ? true : clean === "false" ? false : null;
}

/**
 * Parse CSV data from NJVSS.
 * @param {string} csvText Raw CSV text from NJVSS.
 * @returns {Array<NjvssRecord>}
 */
function parseNjvssCsv(csvText) {
  // NJVSS CSV data currently is malformed -- fields with commas or quotes is
  // quoted, but the quotes *in* those fields aren't properly escaped. This
  // tries to detect that situaion (we don't want our parser to "fix" it after
  // the issue's been corrected at the source) and clean it up before parsing.
  let cleanText = csvText;
  if (/[^,"]"[^,"]/.test(csvText)) {
    cleanText = csvText.replace(
      /(^|,)"(.*?)"(,|$)/gms,
      (_, start, content, end) => {
        const escapedContent = content.replace(/"/g, '""');
        return `${start}"${escapedContent}"${end}`;
      }
    );
  }

  return csvParse.parse(cleanText, {
    columns: true,
    cast: true,
    // Some values can't be automatically cast, so cast them explicitly here.
    on_record(record) {
      const residentsOnlyKey = "vras_allowschedulingforcountyresidentsonly";
      record[residentsOnlyKey] = parseBooleanText(record[residentsOnlyKey]);
      if (record.vras_latitude === "") record.vras_latitude = null;
      if (record.vras_longitude === "") record.vras_longitude = null;
      return record;
    },
  });
}

/**
 * Get current availability data directly from NJVSS with no post-processing.
 * @returns {Promise<{lastModified?: Date, rawString: string}>}
 */
async function getNjvssDataRaw() {
  const accessKeyId =
    process.env["NJVSS_AWS_KEY_ID"] || process.env["AWS_ACCESS_KEY_ID"];
  const secretAccessKey =
    process.env["NJVSS_AWS_SECRET_KEY"] || process.env["AWS_SECRET_ACCESS_KEY"];

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(oneLine`
      To load NJVSS data, you must set the NJVSS_AWS_KEY_ID (or
      AWS_ACCESS_KEY_ID) and NJVSS_AWS_SECRET_KEY (or AWS_SECRET_ACCESS_KEY)
      environment variables
    `);
  }

  const client = new S3({
    credentials: { accessKeyId, secretAccessKey },
    region: NJVSS_DATA_REGION,
  });
  const object = await client.getObject({
    Bucket: NJVSS_DATA_BUCKET,
    Key: NJVSS_DATA_KEY,
  });

  return {
    lastModified: object.LastModified,
    rawString: await getStream(object.Body),
  };
}

/**
 * Get current availability data from the NJVSS.
 * A separate process continuously exports current availability data from the
 * NJVSS database to a CSV file in S3, which is what this function loads.
 * @returns {Promise<{lastModified?: Date, records: Array<NjvssRecord>}>}
 */
async function getNjvssData() {
  const raw = await getNjvssDataRaw();
  return {
    lastModified: raw.lastModified,
    records: parseNjvssCsv(raw.rawString),
  };
}

/**
 * Remove NJVSS locations from an array if they probably don't actually
 * participate in NJVSS for scheduling appointments or should be hidden.
 *
 * The NJVSS database includes many locations that are not actually
 * participating in NJVSS for scheduling, and which will never have open
 * bookings in NJVSS even if they have appointments (i.e. their availability
 * should come from other sources, not this NJVSS module).
 * @param {Array<NjvssRecord>} locations
 * @returns {Array<NjvssRecord>}
 */
function filterHiddenNjvssLocations(locations) {
  return locations.filter((location) => {
    // Null location coordinates indicate a location should not be listed.
    // (VRAS doesn't support hiding locations, so this is the hack used inside
    // the system to do so.)
    if (location.vras_latitude == null || location.vras_longitude == null) {
      if (location.available > 0) {
        warn(oneLine`
          Hiding NJVSS location with appointments because it has no coordinates:
          "${location.name}"
        `);
      }
      return false;
    }

    return true;
  });
}

/**
 * Match up locations from the NJVSS database with locations from the API.
 * Because NJVSS data doesn't currently include IDs, and all the other fields
 * are malleable, IDs for NJVSS are arbitrary.
 * In the mean time, this function tries to reduce duplication by roughly
 * matching live NJVSS data to an existing record from our API and use that
 * record's ID if possible.
 *
 * Returns the list of passed in locations, but with some modified to add an
 * `id` property if a existing match was found.
 * @param {Array<object>} locations List of found NJVSS locations.
 * @returns {Promise<Array<object>>}
 */
async function findLocationIds(locations) {
  // FIXME: a lot has changed about how we manage locations and IDs since this
  // was written. We can probably just use external_ids for this job now!
  let savedLocations;
  try {
    const client = ApiClient.fromEnv();
    savedLocations = await client.getLocations({ state: "NJ" });
  } catch (error) {
    warn(
      `Could not contact API. This may output already known locations without IDs. (${error})`
    );
    return locations;
  }

  for (const saved of savedLocations) {
    saved.simpleAddress = matchableAddress(saved.address_lines);
    saved.simpleName = matchable(saved.name);
  }
  const unmatched = savedLocations.slice();

  const matched = locations.map((location) => {
    // Just match on the first address line. Entries in the DoH list use a
    // variety of formats and the first line is still more-or-less unique.
    let simpleAddress = matchableAddress(location.address_lines[0]);
    let simpleName = matchable(location.name);

    // Manual overrides for cases where the data just does not reconcile :(
    if (simpleAddress === "college center 1400 tanyard road") {
      simpleAddress = "1400 tanyard road";
    }
    if (simpleName === "vineland doh public health nursing") {
      simpleName = "city of vineland health department";
    }

    return { location, simpleAddress, simpleName, match: null };
  });

  // We need to do three separate loops for matching (address + name,
  // address only, name only) because the names are not very unique, and if we
  // did a single pass, we might have a record that matches by name when we
  // would prefer it match an address later on in the list.
  //
  // For example, if the API has an entry like:
  //   {name: "Trinitas Regional Medical Center", address: "600 Pearl St."}
  // And NJVSS has:
  //   {name: "Trinitas Regional Medical Center", address: "225 Williamson St."}
  //   {name: "TRMC at Thomas Dunn Sports Center", address: "600 Pearl St."}
  //
  // A single pass check of all 3 kinds of matches would join the API record to
  // the first NJVSS site instead of the second, which would be more accurate.
  // The same situation also applies in reverse.
  for (const item of matched) {
    if (!item.match) {
      item.match = popItem(
        unmatched,
        (saved) =>
          saved.simpleAddress.includes(item.simpleAddress) &&
          saved.simpleName.includes(item.simpleName)
      );
    }
  }

  for (const item of matched) {
    if (!item.match) {
      item.match = popItem(unmatched, (saved) =>
        saved.simpleAddress.includes(item.simpleAddress)
      );
    }
  }

  for (const item of matched) {
    if (!item.match) {
      item.match = popItem(unmatched, (saved) =>
        saved.simpleName.includes(item.simpleName)
      );
    }
  }

  for (const item of matched) {
    if (item.match) {
      item.location.id = item.match.id;
    }
  }

  return locations;
}

/**
 * Remove the address from a location's description and return everything after.
 * If the address can't be identified, the original text is returned unaltered.
 * @param {string} text
 * @returns {string}
 */
function getDescriptionDetails(text) {
  let result = text;

  // The description starts with a paragraph containing the address. However,
  // the markup is not exactly clean, and there may be `</p>` to close the
  // paragraph or there may just be a `<p>` to open the next paragraph.
  const remaining = text.slice(3);
  const secondParagraph = remaining.match(/<(\/?)p/);
  if (secondParagraph) {
    // If we match a closing tag, take everything *after* it.
    const offset = secondParagraph[1] ? 4 : 0;
    result = remaining.slice(secondParagraph.index + offset);
  }

  return result.trim();
}

const spaceRegex = /\s+/g;

function createNjIisId(location) {
  return `${location.provider_id}:${location.name}`
    .replace(spaceRegex, "_")
    .toUpperCase();
}

/**
 * @param {string} text Data from the vras_typetext field of the NJVSS export.
 * @returns an array of strings representing which vaccines are available
 */
function parseVaccineProducts(text) {
  return [...text.matchAll(/<li>(?<vaccineName>.*?)<\/li>/gi)]
    .map((match) => {
      if (Object.hasOwn(VACCINE_NAMES, match.groups.vaccineName)) {
        return VACCINE_NAMES[match.groups.vaccineName];
      }

      warn(
        `Unknown vaccine: "${match.groups.vaccineName}"`,
        {
          foundName: match.groups.vaccineName,
          text,
        },
        true
      );
      return null;
    })
    .filter(Boolean);
}

/**
 * Parse a location address from NJVSS.
 * @param {string} address
 * @returns {{lines: Array<string>, city: string, state: string, zip: string}}
 */
function parseNjvssAddress(address) {
  try {
    return parseUsAddress(address);
  } catch (error) {
    warn(error);
    return { lines: [address], city: null, state: "NJ", zip: null };
  }
}

const walmartPattern = /(walmart(?<sams>\/Sams)?) #?(?<storeId>\d+)\s*$/i;

/**
 * Get availability for locations scheduled through NJVSS.
 * @returns {Promise<Array<object>>}
 */
async function checkAvailability(handler, _options) {
  const data = await getNjvssData();
  const checkTime = new Date().toISOString();
  const validTime = data.lastModified?.toISOString();
  const locations = filterHiddenNjvssLocations(data.records);

  let result = [];
  for (const location of locations) {
    let provider = PROVIDER.njvss;

    // Apply corrections for known-bad source data.
    if (location.res_id in corrections) {
      Object.assign(location, corrections[location.res_id]);
    }

    // FIXME: there are some fields we should not try to update if
    // `_options.send` is true (we expect NJVSS to have messy data, and
    // manually entered data in the DB will be better). This may need some
    // changes on the API side, too.
    const address = parseNjvssAddress(location.vras_provideraddress);
    const products = parseVaccineProducts(location.vras_typetext);

    // Description in the API is dynamic -- if there's no availability, it's a
    // message about that instead of actual information about the location.
    // Only add it if there is availability.
    let description = undefined;
    if (location.available) {
      description = getDescriptionDetails(location.vras_typetext || "");
    }

    let location_type = LocationType.clinic;
    const clean_name = location.name.toLowerCase();
    if (clean_name.includes("megasite")) {
      location_type = LocationType.massVax;
    } else if (
      clean_name.includes("pharmacy") ||
      clean_name.includes("drugs")
    ) {
      location_type = LocationType.pharmacy;
    }

    const external_ids = [
      // NJ IIS locations sometimes run multiple ad-hoc locations, and so have
      // the same IIS identifier. `njiis_covid` adds in the location name to
      // make the identifier unique.
      ["njiis_covid", createNjIisId(location)],
      ["njvss_res_id", location.res_id || undefined],
    ];

    let name = location.name;

    // Customize provider & external_ids for private providers are using NJVSS.
    const walmartMatch = location.name.match(walmartPattern);
    if (walmartMatch) {
      location_type = LocationType.pharmacy;
      const storeNumber = unpadNumber(walmartMatch.groups.storeId);

      if (walmartMatch.groups.sams) {
        external_ids.push(["sams_club", storeNumber]);
        provider = PROVIDER.sams;
        name = `Sam’s Club #${storeNumber}`;
      } else {
        external_ids.push(["walmart", storeNumber]);
        provider = PROVIDER.walmart;
        name = `Walmart #${storeNumber}`;
      }
    }

    const record = {
      external_ids,
      provider,
      location_type,
      name,
      address_lines: address.lines,
      city: address.city,
      state: address.state,
      postal_code: address.zip,
      county: titleCase(location.county),
      position: {
        longitude: location.vras_longitude,
        latitude: location.vras_latitude,
      },
      info_phone: "1-855-568-0545",
      info_url: "https://covid19.nj.gov/pages/vaccine",
      booking_phone: "1-855-568-0545",
      booking_url: NJVSS_WEBSITE,
      description,
      requires_waitlist: false,
      meta: { njiis: location.provider_id },
      // is_public: true,

      availability: {
        source: "univaf-njvss",
        valid_at: validTime,
        checked_at: checkTime,
        available: location.available > 0 ? Available.yes : Available.no,
        available_count: location.available,
        products: products.length ? products : undefined,
      },
    };
    result.push(record);
  }

  result = await findLocationIds(result);
  for (const record of result) {
    handler(record, { update_location: true });
  }

  return result;
}

module.exports = {
  checkAvailability,
  getNjvssData,
  getNjvssDataRaw,
};
