const turfDistance = require("@turf/distance").default;
const {
  matchableAddress,
  unpadNumber,
  parseUsAddress,
} = require("../../utils");

let allLocations;
let addressIndex;

function loadData(force = false) {
  if (force || !allLocations) {
    const scrapedData = require("./albertsons-pharmacies.json");
    const haggenData = require("./haggen-stores.json");
    allLocations = scrapedData.concat(haggenData);

    addressIndex = allLocations.reduce((index, l) => {
      const key = matchableAddress(
        `${l.address.line1}, ${l.address.city}, ${l.address.region} ${l.address.postalCode}`
      );
      index[key] = l;
      return index;
    }, Object.create(null));
  }
}

function getAllKnownAlbertsons() {
  loadData();
  return allLocations;
}

/**
 * Find known information about an Albertsons store from saved data files.
 * This accepts a variety of ways to search, and attempts to return the best
 * match, or null if no match is reasonable.
 *
 * The data comes primarily from scraping Albertsons sub-brand websites. See
 * ./scrape-albertsons-stores for how this is done and an idea of the data
 * format.
 * @param {{ lat: number, long: number }} coordinate Geographic coordinate
 *        of location to find.
 * @param {string} address Address of location to find.
 * @param {{ test: (x: string) => boolean }} storeBrand Store brand object from
 *        the main albertsons module to check matches against.
 * @param {string} storeNumber A store number to find.
 * @returns {any}
 */
function findKnownAlbertsons(coordinate, address, storeBrand, storeNumber) {
  // Load and index pharmacy data lazily; it's big!
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

  // if (address.includes("729 North H")) {
  //   console.warn(`${matches.length} number matches for ${address}:`);
  //   for (const item of matches) {
  //     const l = item.data;
  //     console.warn(
  //       `  Score: ${item.score} / Distance: ${item.distance} / ${
  //         item.factors
  //       } / ${l.name} #${
  //         l.c_parentEntityID
  //       }, ${`${l.address.line1}, ${l.address.city}, ${l.address.region} ${l.address.postalCode}`}`
  //     );
  //   }
  // }

  if (matches.length) {
    // const match = matches[0].data;
    // console.error(`MATCHED BY NUMBER:
    // Appointment address: ${storeBrand?.name} #${storeNumber}, ${address}
    // Match address:       ${match.name} #${match.c_parentEntityID} (old: ${match.c_oldStoreID}), ${match.address.line1}, ${match.address.city}, ${match.address.region} ${match.address.postalCode}`);
    return { method: "fuzzy", ...matches[0] };
  }

  return null;

  if (coordinate) {
    // const data =
    //   pharmacyData.byGeohash[
    //     ngeohash.encode(coordinate.lat, coordinate.long, geohashPrecision)
    //   ];
    // if (data) return { method: "geo", data };

    // const nearby = pharmacyData.all.filter((l) => {
    //   if (l.geocodedCoordinate) {
    //     const distance = turfDistance(
    //       [l.geocodedCoordinate.long, l.geocodedCoordinate.lat],
    //       [coordinate.long, coordinate.lat]
    //     );
    //     return distance < 0.3;
    //   }
    //   return false;
    // });
    // if (nearby.length > 1) {
    //   console.warn(`${nearby.length} nearby ${address}`);
    // }
    // if (nearby[0]) return { method: "geo", data: nearby[0] };

    let closestDistance = Infinity;
    let closestData = null;
    const maxDistance = 0.3;
    const matchDistance = 0.05;
    for (const l of allLocations) {
      if (!l.geocodedCoordinate) continue;

      const distance = turfDistance(
        [l.geocodedCoordinate.long, l.geocodedCoordinate.lat],
        [coordinate.long, coordinate.lat]
      );
      if (distance < matchDistance) {
        closestData = l;
        break;
      } else if (distance < closestDistance && distance < maxDistance) {
        closestDistance = distance;
        closestData = l;
      }
    }
    if (closestData) return { method: "geo", data: closestData };
    // const nearby = pharmacyData.all
    //   .map((l) => {
    //     if (l.geocodedCoordinate) {
    //       const distance = turfDistance(
    //         [l.geocodedCoordinate.long, l.geocodedCoordinate.lat],
    //         [coordinate.long, coordinate.lat]
    //       );
    //       return { distance, data: l };
    //     }
    //     return { distance: Infinity, data: null };
    //   })
    //   .filter((x) => x.distance < 0.3);
    // if (nearby.length > 1) {
    //   console.warn(`${nearby.length} nearby ${address}:`);
    //   for (const item of nearby) {
    //     const l = item.data;
    //     console.warn(
    //       `  ${item.distance} km: ${l.name} #${
    //         l.c_parentEntityID
    //       }, ${`${l.address.line1}, ${l.address.city}, ${l.address.region} ${l.address.postalCode}`}`
    //     );
    //   }
    // }
    // if (nearby[0]) return { method: "geo", data: nearby[0].data };
  }
  if (storeNumber) {
    const toMatch = unpadNumber(storeNumber);
    // const matches = allLocations
    //   .map((l) => {
    //     const parentIdMatch = unpadNumber(l.c_parentEntityID) === toMatch;
    //     const oldIdMatch = unpadNumber(l.c_oldStoreID || "") === toMatch;
    //     if (!parentIdMatch && !oldIdMatch) return null;

    //     let score = 0;
    //     let distance = Infinity;
    //     if (parentIdMatch && oldIdMatch) {
    //       score += 0.2;
    //     }
    //     if (coordinate && l.geocodedCoordinate) {
    //       distance = turfDistance(
    //         [l.geocodedCoordinate.long, l.geocodedCoordinate.lat],
    //         [coordinate.long, coordinate.lat]
    //       );
    //       if (distance > 100) {
    //         return null;
    //       } else {
    //         // Anything within 5 km gets the max score
    //         score = 1 / Math.max(distance, 5);
    //         // score = 0.2 * 1 / (1 + distance);
    //       }
    //     }
    //     if (storeBrand?.pattern?.test(l.name)) {
    //       score += 1;
    //     }
    //     return { score, distance, data: l };
    //   })
    //   .filter(Boolean)
    //   .sort((a, b) => b.score - a.score);
    const matches = allLocations
      .filter(
        (l) =>
          unpadNumber(l.c_parentEntityID) === toMatch ||
          unpadNumber(l.c_oldStoreID || "") === toMatch
      )
      .map((l) => {
        // XXX: should probably bump the score if both new and old IDs match.
        let score = 0;
        let distance = Infinity;
        if (coordinate && l.geocodedCoordinate) {
          distance = turfDistance(
            [l.geocodedCoordinate.long, l.geocodedCoordinate.lat],
            [coordinate.long, coordinate.lat]
          );
          if (distance > 100) {
            return null;
          } else {
            // Anything within 5 km gets the max score
            score = 0.2 / Math.max(1, distance - 4);
            // score = 1 / Math.max(distance, 5);
            // vs. smooth gradation from closest
            // score = (0.2 * 1) / (1 + distance);
          }
        }
        if (storeBrand?.pattern?.test(l.name)) {
          score += 1;
        }
        return { score, distance, data: l };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    // if (matches.length > 1) {
    //   console.warn(`${matches.length} number matches for ${address}:`);
    //   for (const item of matches) {
    //     const l = item.data;
    //     console.warn(
    //       `  Score: ${item.score} / Distance: ${item.distance} / ${l.name} #${
    //         l.c_parentEntityID
    //       }, ${`${l.address.line1}, ${l.address.city}, ${l.address.region} ${l.address.postalCode}`}`
    //     );
    //   }
    // }

    if (matches.length) {
      // const match = matches[0].data;
      // console.error(`MATCHED BY NUMBER:
      // Appointment address: ${storeBrand?.name} #${storeNumber}, ${address}
      // Match address:       ${match.name} #${match.c_parentEntityID} (old: ${match.c_oldStoreID}), ${match.address.line1}, ${match.address.city}, ${match.address.region} ${match.address.postalCode}`);
      return { method: "number", data: matches[0].data };
    }
  }
  return null;
}

module.exports = { findKnownAlbertsons, getAllKnownAlbertsons };
