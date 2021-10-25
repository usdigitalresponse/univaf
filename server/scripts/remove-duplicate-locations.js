#!/usr/bin/env node
/**
 * Quick script for merging duplicate locations from the database based on
 * their external IDs.
 *
 * Use the `--unpad` option to check unpadded versions of external IDs when
 * merging. That is, the IDs `kroger:0123` and `kroger:123` will be considered
 * as if they were the same.
 *
 * Limit what systems to consider for merging by setting `--system` to a comma
 * separated list of systems, e.g. `--system 'cvs,kroger'` to only merge based
 * on `cvs:*` and `kroger:*` IDs, but not, for example, `walgreens:*` IDs.
 *
 * By default, this prints a plan of the steps it's going to take, but does not
 * alter the contents of the database. Add the `--commit` option to actually
 * make the changes.
 *
 * Multiple locations with the same external ID will get "merged" -- one
 * location will be given all the external IDs and availability records of the
 * others, and the others will be deleted. The IDs of the old locations are
 * preserved as a `univaf_v1` external ID on the remaining location.
 *
 * Old, `univaf_v0` IDs are preserved on the remaining, merged location in the
 * same way as described above for v1 IDs.
 */

const { db, planMerge, doMerge, locationsQuery } = require("./merge-locations");

function writeLog(...args) {
  console.warn(...args);
}

async function loadLocations() {
  const locations = await locationsQuery();
  writeLog("Total locations:", locations.length);
  return locations;
}

/**
 * Group locations by external ID. Locations will appear in more than one group
 * if more than one external ID is shared.
 * @param {Array} locations
 * @param {Array<string>} [systems] Only consider these external ID systems.
 * @param {boolean} [unpadIds] Compare unpadded versions of numeric IDs.
 * @returns {Map<string,Array>}
 */
function groupLocations(locations, systems = null, unpadIds = false) {
  const byExternalId = new Map();

  // Make a locations lookup and an external IDs lookup
  for (const location of locations) {
    if (unpadIds) {
      // Add un-zero-padded versions of all IDs for matching.
      // e.g. if we have `kroger:01234567`, add `kroger:1234567`.
      const simpleIds = new Set(
        location.external_ids.map(({ system, value }) => `${system}:${value}`)
      );
      for (const { system, value } of location.external_ids.slice()) {
        const unpadded = value.replace(/^0+(\d+)$/, "$1");
        if (unpadded !== value && !simpleIds.has(`${system}:${unpadded}`)) {
          simpleIds.add(`${system}:${unpadded}`);
          location.external_ids.push({ system, value: unpadded });
        }
      }
    }

    for (const { system, value } of location.external_ids) {
      // Skip not-quite-unique systems
      if (system === "vtrcks") continue;
      // Skip internal identifiers
      if (system === "univaf_v0") continue;
      if (system === "univaf_v1") continue;

      // Only for specified systems
      if (systems && !systems.includes(system)) continue;

      const simpleId = `${system}:${value}`;
      let locationSet = byExternalId.get(simpleId);
      if (!locationSet) {
        locationSet = [];
        byExternalId.set(simpleId, locationSet);
      }
      locationSet.push(location);
    }
  }

  return byExternalId;
}

/**
 * Given an array of sets that may intersect, find all the unions of sets that
 * have intersections.
 * @param {Array<Set|Array>} sets
 * @returns {Array<Set>}
 *
 * @example
 * const sets = [
 *   ['a', 'b', 'c'],
 *   ['a', 'd', 'e'],
 *   ['b', 'f'],
 *   ['e', 'g'],
 *   ['h', 'i'],
 *   ['i', 'k']
 * ];
 * unionsOfIntersectingSets(sets) === [
 *   {'a', 'b', 'c', 'd', 'e', 'f', 'g'},
 *   {'h', 'i', 'k'}
 * ];
 */
function unionsOfIntersectingSets(sets) {
  return (
    sets
      // Skip groups where there are no duplicates.
      .filter((items) => items.length > 1)
      // The next step will modify the sets, so make copies to work with.
      .map((items) => new Set(items))
      .map((items, index, allSets) => {
        for (const item of items) {
          for (const otherSet of allSets.slice(index + 1)) {
            if (otherSet.has(item)) {
              otherSet.forEach((otherItem) => items.add(otherItem));
              otherSet.clear();
            }
          }
        }
        return items;
      })
      // We'll have left behind some empty groups, so drop those from the result.
      .filter((items) => items.size > 0)
  );
}

/**
 * @param {Map<string,any>} locations
 * @param {Map<string,Array>} byExternalId
 */
function planChanges(byExternalId) {
  // A given location might share different external IDs with different other
  // locations -- i.e. the same location might appear in more than one entry of
  // `byExternalId`. We need to find the supersets of these commonalities to
  // determine the complete list of locations to merge.
  const mergeGroups = unionsOfIntersectingSets([...byExternalId.values()]);

  // Plan merges for each group.
  const plans = [];
  for (const group of mergeGroups) {
    // Sort by oldest first, so that the oldest becomes the target all the
    // others merge into.
    const sorted = [...group].sort((a, b) => a.created_at - b.created_at);
    plans.push(planMerge(...sorted));
  }

  // Sanity check all the external ID pairs are unique
  const seenPairs = new Set();
  for (const { newIds } of plans) {
    for (const id of newIds) {
      const pair = `${id.system}:${id.value}`;
      if (seenPairs.has(pair)) {
        writeLog(
          "The same external ID is being used on multiple locations:",
          pair
        );
      }
      seenPairs.add(pair);
    }
  }

  return plans;
}

/**
 * @param {Map} toUpdate
 * @param {Map} toRemove
 * @param {boolean} persist
 */
async function doChanges(plans, persist = false) {
  let removed = 0;
  let updated = 0;
  for (const plan of plans) {
    updated++;
    removed += plan.deleteLocations.length;
    doMerge(plan, persist);
    writeLog("");
  }

  writeLog(`Removing ${removed} duplicates`);
  writeLog(`Adding to ${updated} locations`);
}

async function main() {
  const commit = process.argv.includes("--commit");
  const unpadIds = process.argv.includes("--unpad");
  const systemIndex = process.argv.findIndex((x) => x === "--system");
  let systems = null;
  if (systemIndex > -1) {
    systems = process.argv[systemIndex + 1].split(",").map((x) => x.trim());
  }

  const locations = await loadLocations();
  const byExternalId = groupLocations(locations, systems, unpadIds);
  const plans = planChanges(byExternalId);

  await doChanges(plans, commit);

  if (!commit) {
    writeLog("");
    writeLog("This is a plan. Run with --commit to actually make changes.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
