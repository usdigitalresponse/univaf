const { Logger } = require("../../logging");
const knownStores = require("./known-stores");

// Show the corporate number instead of individual pharmacies' numbers because:
// - Most pharmacies can not book appointments directly over the phone.
// - Small pharmacies may have their phone lines slammed by too many callers.
const CVS_CORPORATE_PHARMACY_PHONE_NUMBER = "(800) 746-7287";

const CVS_BOOKING_URL = "https://www.cvs.com/vaccine/intake/store/cvd-schedule";

const logger = new Logger("cvs/shared");

/**
 * Helper function to return a county string based on CVS store number
 * @param {string} storeNumber
 */
function getStoreCounty(storeNumber) {
  if (knownStores[storeNumber]) {
    // If we have knowledge of this store's county in the known store table,
    // use it. This is useful when we know geocode guesses will fail
    // (e.g. a zip code that maps to multiple counties).
    if (knownStores[storeNumber].county) {
      return knownStores[storeNumber].county;
    }
  } else {
    logger.warn(`CVS #${storeNumber} is not in known store list`);
    return;
  }

  // FIXME: The original implementation relies on a bunch of data files where
  // hardcoded lists of stores and details are stored in a variety of ways. Now
  // that we are moving towards a database with separate store and availability
  // tables, we should probably be doing all that work directly against the DB
  // instead of storing things in the codebase.
  // // If we have no knowledge of the county, fallback onto guessing.
  // let geocodeGuess = geocoding.guessCounty(knownStores[storeNumber].address);
  // if (geocodeGuess) {
  //   return geocodeGuess;
  // }

  // This is the worst case. We are going to show the user "Unknown County"
  // We should avoid this whenever possible.
  logger.warn(
    `Store address ${knownStores[storeNumber].address} has no county`
  );
  return null;
}

module.exports = {
  CVS_CORPORATE_PHARMACY_PHONE_NUMBER,
  CVS_BOOKING_URL,
  getStoreCounty,
};
