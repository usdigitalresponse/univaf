const { Available, LocationType } = require("../../model");
const crypto = require("crypto");
const csvParse = require("csv-parse/lib/sync");
const getStream = require("get-stream");
const { S3 } = require("@aws-sdk/client-s3");
const {
  matchable,
  matchableAddress,
  oneLine,
  popItem,
  titleCase,
  warn,
} = require("../../utils");

const NJVSS_WEBSITE = "https://covidvaccine.nj.gov";
const NJVSS_PROVIDER = "NJVSS";
const NJVSS_AWS_KEY_ID =
  process.env["NJVSS_AWS_KEY_ID"] || process.env["AWS_ACCESS_KEY_ID"];
const NJVSS_AWS_SECRET_KEY =
  process.env["NJVSS_AWS_SECRET_KEY"] || process.env["AWS_SECRET_ACCESS_KEY"];
const NJVSS_DATA_REGION = "us-east-1";
const NJVSS_DATA_BUCKET = "njvss-pinpoint-reports";
const NJVSS_DATA_KEY = "njvss-available-appointments.csv";

/**
 * @typedef {Object} NjvssRecord
 * @property {string} name
 * @property {string} statuscodename
 * @property {string} vras_provideraddress
 * @property {string} vras_typename Type of service, usually 'COVID Vaccination'
 * @property {float} vras_latitude
 * @property {float} vras_longitude
 * @property {string} vras_typetext Additional details as an HTML string.
 * @property {boolean?} vras_allowschedulingforcountyresidentsonly Whether
 *           scheduling is allowed only for county residents. May be `null` if
 *           unknown.
 * @property {string} county
 * @property {int} available Number of available appointment slots
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

  return csvParse(cleanText, {
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
 * @returns {Promise<string>}
 */
async function getNjvssDataRaw() {
  if (!NJVSS_AWS_KEY_ID || !NJVSS_AWS_SECRET_KEY) {
    throw new Error(oneLine`
      To load NJVSS data, you must set the NJVSS_AWS_KEY_ID (or
      AWS_ACCESS_KEY_ID) and NJVSS_AWS_SECRET_KEY (or AWS_SECRET_ACCESS_KEY)
      environment variables
    `);
  }

  const client = new S3({
    credentials: {
      accessKeyId: NJVSS_AWS_KEY_ID,
      secretAccessKey: NJVSS_AWS_SECRET_KEY,
    },
    region: NJVSS_DATA_REGION,
  });
  const object = await client.getObject({
    Bucket: NJVSS_DATA_BUCKET,
    Key: NJVSS_DATA_KEY,
  });

  return await getStream(object.Body);
}

/**
 * Get current availability data from the NJVSS.
 * A separate process continuously exports current availability data from the
 * NJVSS database to a CSV file in S3, which is what this function loads.
 * @returns {Promise<Array<NjvssRecord>>}
 */
async function getNjvssData() {
  const raw = await getNjvssDataRaw();
  return parseNjvssCsv(raw);
}

/**
 * Remove NJVSS locations from an array if they probably don't actually
 * participage in NJVSS for scheduling appointments.
 *
 * The NJVSS database includes many locations that are not actually
 * participating in NJVSS for scheduling, and which will never have open
 * bookings in NJVSS even if they have appointments (i.e. their availability
 * should come from other sources, not this NJVSS module).
 *
 * For now, we keep a list of NJVSS locations that we have previously seen with
 * available appointments and limit the output of this module to only those
 * locations (+ any that have availability now).
 * @param {Array<NjvssRecord>} locations
 * @returns {Array<NjvssRecord>}
 */
function filterActualNjvssLocations(locations) {
  let knownLocations = require("./known-njvss-locations.json");
  knownLocations = knownLocations.map((known) => {
    return Object.assign({}, known, {
      simpleName: matchable(known.name),
      simpleAddress: matchableAddress(known.address),
    });
  });

  const filtered = locations.filter((location) => {
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

    const simpleAddress = matchableAddress(location.vras_provideraddress);
    const simpleName = matchable(location.name);

    // There are a few locations with the same address but different names, so
    // try to find a complete before matching only one field.
    let match = popItem(
      knownLocations,
      (known) =>
        known.simpleAddress === simpleAddress && known.simpleName === simpleName
    );
    if (match) return true;

    match = popItem(
      knownLocations,
      (known) =>
        known.simpleAddress === simpleAddress || known.simpleName === simpleName
    );
    if (match) return true;

    // If our list of known locations is incomplete, log it so we have a signal
    // that we should to update our list of known participating locations.
    if (location.available > 0) {
      warn(oneLine`
        NJVSS reports availability for a new site: "${location.name}" at
        "${location.vras_provider_address}"
      `);
    }

    return (
      location.available > 0 ||
      location.vras_allowschedulingforcountyresidentsonly != null
    );
  });

  // Sanity-check that we don't have any previously known locations that didn't
  // match up to something in the NJVSS database now.
  for (const known of knownLocations) {
    warn(oneLine`
      Previously known NJVSS location not found in database:
      "${known.name}" at "${known.address}"
    `);
  }

  return filtered;
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
  let remaining = text.slice(3);
  const secondParagraph = remaining.match(/<(\/?)p/);
  if (secondParagraph) {
    // If we match a closing tag, take everything *after* it.
    const offset = secondParagraph[1] ? 4 : 0;
    result = remaining.slice(secondParagraph.index + offset);
  }

  return result.trim();
}

const addressPattern = /^(.*),\s([^,]+),\s+NJ\s+(\d+)\s*$/;

/**
 * Parse a location address from NJVSS. (Luckily these are all very regularly
 * formatted so address parsing is not hard.)
 * @param {string} address
 * @returns {{lines: Array<string>, city: string, state: string, zip: string}}
 */
function parseAddress(address) {
  const match = address.match(addressPattern);
  if (!match) {
    warn(`Could not parse NJVSS address: "${address}"`);
    return { lines: [address], city: null, state: "NJ", zip: null };
  }

  return {
    lines: [match[1]],
    city: match[2],
    state: "NJ",
    zip: match[3],
  };
}

/**
 * Get availability for locations scheduled through NJVSS.
 * @returns {Promise<Array<object>>}
 */
async function checkAvailability(handler, _options) {
  console.error("Checking New Jersey VSS (https://covidvaccine.nj.gov)...");

  const checkTime = new Date().toISOString();
  let locations = await getNjvssData();
  // Not all locations listed in NJVSS are actively participating, so we need
  // to filter non-participants out.
  locations = filterActualNjvssLocations(locations);

  const result = [];
  for (const location of locations) {
    // FIXME: This is a bad way to calculate an ID (both name and address are
    // prone to change). We need to pull locations from the DB and/or get IDs
    // from within NJVSS/VRAS (there aren't any in this exported data, sadly).
    const simpleAddress = matchableAddress(location.vras_provideraddress);
    const simpleName = matchable(location.name);
    const id = crypto
      .createHash("sha1")
      .update(`${simpleName} ${simpleAddress}`)
      .digest("hex");

    const address = parseAddress(location.vras_provideraddress);

    const record = {
      id,
      // FIXME: ideally, we'd have some NJVSS/VRAS-based IDs here.
      // external_ids: {},
      provider: NJVSS_PROVIDER,
      location_type: simpleName.includes("megasite")
        ? LocationType.massVax
        : LocationType.clinic,
      name: location.name,

      // TODO: parse the address to get city and postal code.
      address_lines: address.lines,
      city: address.city,
      state: "NJ",
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
      // eligibility: null
      description: getDescriptionDetails(location.vras_typetext || ""),
      requires_waitlist: true,
      // meta: null,
      // is_public: true,

      availability: {
        source: "njvss-export",
        // TODO: See if we can get a field added to the export forr this
        // updated_at: null,
        checked_at: checkTime,
        available: location.available > 0 ? Available.yes : Available.no,
        // meta: {},
        // is_public: true
      },
    };
    handler(record);
    result.push(record);
  }

  return result;
}

module.exports = {
  checkAvailability,
  getNjvssData,
  getNjvssDataRaw,
};
