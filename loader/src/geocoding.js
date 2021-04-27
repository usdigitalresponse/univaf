/**
 * Tools for determining what county a location might be in.
 *
 * This module is inherited from New Jersey; we should [generally] keep in sync
 * with them. Other options:
 *   1. Don't support this functionality here. Users with privileges (like NJ
 *      staff) can update the database out-of-band.
 *   2. Don't support this functionality or data here. NJ can pull from our
 *      API and add county information themselves as necessary.
 *   3. Move this to the API, so it can guess county information for any new
 *      input nationally.
 */

const GEOCODE_DB = require("../data/geocoded.json");
const ZIP_DB = require("../data/zip_to_county.json");
// FIXME: need to implement proper logging
// const { logger } = require("./logging");
const logger = console;

const ZIP_REGEX = /\b0[0-9]{4}\b/;

const ALL_COUNTIES = (() => {
  const s = new Set();
  Object.values(ZIP_DB).forEach((v) => {
    v.counties.forEach((c) => s.add(c.replace(" County", "")));
  });
  return s;
})();

function guessCounty(address) {
  let geocoded = GEOCODE_DB[address];
  if (geocoded && geocoded.county) {
    return geocoded.county.replace(" County", "");
  }
  const match = address.match(ZIP_REGEX);
  if (!match) {
    return null;
  }
  let zip = ZIP_DB[match[0]];
  if (zip && zip.counties.length == 1) {
    return zip.counties[0].replace(" County", "");
  }

  logger.warn(`unable to decode county for ${address}`);

  return null;
}

module.exports = {
  guessCounty,
  ALL_COUNTIES,
};
