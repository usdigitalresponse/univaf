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

/**
 * Group locations by external ID. Locations will appear in more than one group
 * if more than one external ID is shared.
 * @param {Array} locations
 * @param {Array<string>} [systems] Only consider these external ID systems.
 * @param {boolean} [unpadIds] Compare unpadded versions of numeric IDs.
 * @returns {Map<string,Set>}
 */
function groupByExternalId(locations, systems = null, unpadIds = false) {
  const byExternalId = new Map();

  // Make a locations lookup and an external IDs lookup
  for (const location of locations) {
    for (const { system, value } of location.external_ids) {
      // Skip not-quite-unique systems
      if (system === "vtrcks") continue;
      // Skip internal identifiers
      if (system === "univaf_v0") continue;
      if (system === "univaf_v1") continue;

      // Only for specified systems
      if (systems && !systems.includes(system)) continue;

      const mergeValue = unpadIds ? value.replace(/^0+(\d+)$/, "$1") : value;
      const simpleId = `${system}:${mergeValue}`;
      let locationSet = byExternalId.get(simpleId);
      if (!locationSet) {
        locationSet = new Set();
        byExternalId.set(simpleId, locationSet);
      }
      locationSet.add(location);
    }
  }

  return byExternalId;
}

/**
 * Given an array of groups (arrays or sets) of locations, find all the groups
 * that have locations in common and join those groups together. Returns an
 * array of sets of locations.
 * The input is meant to be locations grouped by an external ID; and a location
 * might share different external IDs with different other locations, and thus
 * be listed in multiple groups. We want to group all those locations together
 * in order to merge them.
 * @param {Map<string,Set|Array>} groups
 * @returns {Array<Set>}
 *
 * @example
 * const groups = new Map([
 *   ["a:b", ["a", "b", "c"]],
 *   ["a:c", ["a", "d", "e"]],
 *   ["a:d", ["b", "f"]],
 *   ["a:e", ["e", "g"]],
 *   ["a:f", ["h", "i"]],
 *   ["a:g", ["i", "k"]]
 * ]);
 * mergeGroupsWithCommonLocations(groups) === [
 *   {"a", "b", "c", "d", "e", "f", "g"},
 *   {"h", "i", "k"}
 * ];
 */
function mergeGroupsWithCommonLocations(groups) {
  return (
    [...groups.values()]
      // Skip groups that don't represent duplicates.
      .filter((items) => (items.size || items.length) > 1)
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
 * Given a list of locations, find all the duplicates based on their external
 * IDs. Returns an array of sets, where each set is a group of duplicate
 * locations that should be merged together.
 * @param {Array} locations List of locations to group.
 * @param {string[]} systems List of external ID systems to group by. If not
 *        set, all external ID systems will be used.
 * @param {boolean} unpadIds If true, remove zero-padding from numeric IDs
 *        before using them to find duplicates.
 */
function groupDuplicateLocations(locations, systems = null, unpadIds = false) {
  const byExternalId = groupByExternalId(locations, systems, unpadIds);
  return mergeGroupsWithCommonLocations(byExternalId);
}

/**
 * Create a merge plan for each group that needs to be merged.
 * @param {Array<Set>} mergeGroups
 */
function planChanges(mergeGroups) {
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

async function main(args) {
  const commit = args.includes("--commit");
  const unpadIds = args.includes("--unpad");
  const systemIndex = args.findIndex((x) => x === "--system");
  let systems = null;
  if (systemIndex > -1) {
    systems = args[systemIndex + 1].split(",").map((x) => x.trim());
  }

  const locations = await locationsQuery();
  writeLog("Total locations:", locations.length);
  const duplicates = groupDuplicateLocations(locations, systems, unpadIds);
  const plans = planChanges(duplicates);

  await doChanges(plans, commit);

  if (!commit) {
    writeLog("");
    writeLog("This is a plan. Run with --commit to actually make changes.");
  }
}

module.exports = {
  main,
  groupDuplicateLocations,
  groupByExternalId,
  mergeGroupsWithCommonLocations,
};

if (require.main === module) {
  main(process.argv)
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => db.destroy());
}
