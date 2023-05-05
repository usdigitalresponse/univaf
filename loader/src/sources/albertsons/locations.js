const turfDistance = require("@turf/distance").default;
const {
  matchableAddress,
  unpadNumber,
  parseUsAddress,
} = require("../../utils");

let allLocations;
let addressIndex;
let storeNumberIndex;

function loadData(force = false) {
  if (force || !allLocations) {
    const scrapedData = require("./stores-scraped.json");
    const haggenData = require("./stores-haggen.js");
    const unlistedData = require("./stores-unlisted.js");
    allLocations = [...scrapedData, ...haggenData, ...unlistedData];

    addressIndex = allLocations.reduce((index, l) => {
      const key = matchableAddress(
        `${l.address.line1}, ${l.address.city}, ${l.address.region} ${l.address.postalCode}`
      );
      index[key] = l;
      return index;
    }, Object.create(null));

    storeNumberIndex = allLocations.reduce((index, l) => {
      if (l.c_parentEntityID) {
        index[unpadNumber(l.c_parentEntityID)] = l;
      }
      return index;
    }, Object.create(null));
  }
}

function getAllKnownAlbertsons() {
  loadData();
  return allLocations;
}

/**
 * @typedef {Object} LocationMatch
 * @property {"address"|"fuzzy"} method How the match was found.
 * @property {number} score A number between 0 and 1 indicating how likely
 *           the match is to be correct. 1 is exact.
 * @property {any} data The actual location data.
 * @property {string[]} [factors] For fuzzy matches, what factors contributed
 *           to the match, e.g. brand, number, geo.
 */

/**
 * Find known information about an Albertsons store from saved data files.
 * This accepts a variety of ways to search, and attempts to return the best
 * match, or null if no match is reasonable.
 *
 * The goal is to find the best possible match given the input data, so matches
 * are not always exact. For example, you might pass in both a store number
 * and an address, and get back a store with a different number because it's
 * a better match to the requested address, or because the store number was an
 * "old" store number from a previous identifier system.
 *
 * This returns a special {@link LocationMatch} object. The `data` property is
 * the actual found store data.
 *
 * The data comes primarily from scraping Albertsons sub-brand websites. See
 * ./scrape-albertsons-stores for how this is done and an idea of the data
 * format.
 * @param {string} address Address of the location to find.
 * @param {{ lat: number, long: number }} coordinate Geographic coordinate
 *        of the location to find.
 * @param {{ test: (x: string) => boolean }} storeBrand Store brand object from
 *        the main albertsons module to check matches against.
 * @param {string} storeNumber A store number for the location to find.
 * @returns {LocationMatch}
 */
function findKnownAlbertsons(address, coordinate, storeBrand, storeNumber) {
  // Load and index saved location data lazily; it's big!
  loadData();

  if (address) {
    const data = addressIndex[matchableAddress(address)];
    if (data) return { method: "address", score: 1, data };
  }

  // All other measures are more prone to typos and errors, so score across
  // all of them and choose the best match.
  const cleanNumber = storeNumber ? unpadNumber(storeNumber) : null;
  const geoPoint = coordinate && [coordinate.long, coordinate.lat];
  const parsedAddress = address && parseUsAddress(address);
  const zipCode = parsedAddress?.zip;
  const state = parsedAddress?.state;

  const matches = allLocations
    .map((l) => {
      let score = 0;
      const factors = [];
      let distance;

      if (state && l.address.region !== state) {
        return null;
      }

      if (!storeBrand?.isNotAStore && storeBrand?.pattern?.test(l.name)) {
        factors.push("brand");
        score += 0.1;
      }

      if (cleanNumber) {
        const idMatch = unpadNumber(l.c_parentEntityID || "") === cleanNumber;
        const oldIdMatch = unpadNumber(l.c_oldStoreID || "") === cleanNumber;
        if (idMatch || oldIdMatch) {
          factors.push("number");
          score += 0.25;
          // If this is the *only* ID that could have matched, bump it up more.
          if (idMatch && oldIdMatch) {
            score += 0.1;
          }
        }
      }

      if (geoPoint && l.geocodedCoordinate) {
        // NOTE: distance is kilometers.
        distance = turfDistance(geoPoint, [
          l.geocodedCoordinate.long,
          l.geocodedCoordinate.lat,
        ]);

        // Don't even consider ultra-far distances.
        if (distance > 80) {
          return null;
        }

        // We're mostly dealing with geocoded points, which can be rough, so the
        // logic here is a little quirky, but seems to work well.
        // First, *extremely* close matches get a boosted score. Think of them
        // as more-or-less exact.
        if (distance < 0.15) {
          factors.push("geo");
          score += 0.25;
        } else if (storeBrand?.isNotAStore) {
          // If we think we're dealing with a non-store (e.g. community clinic),
          // don't do a non-exact distance score. This data only has stores, so
          // scoring will suggest stores nearby, which we don't really want.
          // (We *do* want the exact distance matches (above), since that helps
          // us catch locations that were incorrectly classified as community
          // clinics!)
        } else {
          // Treat everything else in a nearby radius (5 km) as the same.
          // (Geocoding sometimes puts a point closer to a different store in
          // dense areas.) Outside that, lower scores for greater distances.
          factors.push("geo");
          const closeness = 1 / (Math.max(distance, 5) - 4);
          score += 0.2 * closeness;
        }
      } else if (zipCode === l.address.postalCode) {
        // If we can't do a distance match, check for matching zip codes, but
        // don't count it as highly as an actual distance check.
        factors.push("zip");
        score += 0.1;
      }

      return { score, factors, distance, data: l };
    })
    .filter((x) => x?.score)
    .sort((a, b) => b.score - a.score);

  if (matches.length) {
    return { method: "fuzzy", ...matches[0] };
  }

  return null;
}

/**
 * Find known information about an Albertsons store based on the store number.
 * If the store number doesn't match a known store, this returns null.
 * @param {string} storeNumber A store number for the location to find.
 * @returns {any}
 */
function findKnownAlbertsonsByNumber(storeNumber) {
  loadData();
  return storeNumberIndex[unpadNumber(storeNumber)];
}

module.exports = {
  findKnownAlbertsons,
  findKnownAlbertsonsByNumber,
  getAllKnownAlbertsons,
};
