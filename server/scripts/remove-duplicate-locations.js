#!/usr/bin/env node
/**
 * Quick script for merging duplicate locations from the database based on
 * their external IDs.
 *
 * By default, this prints a plan of the steps it's going to take, but does not
 * alter the contents of the database. Add the `--commit` option to actually
 * make the changes.
 *
 * At the end of the run, a JSON object will be printed on STDOUT that maps
 * old to new IDs for records that were merged.
 *
 * Multiple locations with the same external ID will get "merged" -- one
 * location will be given all the external IDs and availability records of the
 * others, and the others will be deleted. The IDs of the old locations are
 * preserved as a `univaf_v1` external ID on the remaining location. If more
 * than one is merged, their external IDs will have an incrementing number on
 * the end, e.g. `univaf_v1`, `univaf_v1_2`, `univaf_v1_3`.
 *
 * Old, `univaf_v0` IDs are preserved on the remaining, merged location in the
 * same way as described above for v1 IDs.
 */

const { db, planMerge, doMerge, locationsQuery } = require("./merge-locations");

function writeLog(...args) {
  console.warn(...args);
}

function writeData(text) {
  console.log(text);
}

async function loadLocations() {
  const locations = await locationsQuery();
  writeLog("Total locations:", locations.length);
  return locations;
}

function groupLocations(locations) {
  const byId = new Map();
  const byExternalId = new Map();

  // Make a locations lookup and an external IDs lookup
  for (const location of locations) {
    byId.set(location.id, location);

    for (let { system, value } of location.external_ids) {
      // Skip not-quite-unique systems
      if (system === "vtrcks") continue;
      // Skip internal identifiers
      if (system === "univaf_v0") continue;

      // Early seed data had this mistake in it, and that seed data got wrongly
      // loaded into production. No other entries use the "storeNumber" system,
      // so this is safe.
      if (system === "storeNumber") {
        system = "cvs";
        value = value.toString().padStart(5, "0");
      }

      const simpleId = `${system}:${value}`;
      let locationSet = byExternalId.get(simpleId);
      if (!locationSet) {
        locationSet = [];
        byExternalId.set(simpleId, locationSet);
      }
      locationSet.push(location);
    }
  }

  return { byId, byExternalId };
}

/**
 * @param {Map<string,any>} locations
 * @param {Map<string,Array>} byExternalId
 * @param {boolean} persist
 */
function planChanges(byId, byExternalId) {
  // Union all the intersecting sets of locations with matching external IDs
  // so we have a list of all groups of locations that have some external IDs
  // in common.
  const groupMap = new Map();
  for (const idGroup of byExternalId.values()) {
    if (idGroup.length === 1) continue;

    let parentSets = idGroup.map((x) => groupMap.get(x)).filter(Boolean);
    let homeSet = parentSets.shift() || new Set();
    for (const parent of parentSets) {
      if (parent === homeSet) continue;

      for (const element of parent) {
        homeSet.add(element);
        groupMap.set(element, homeSet);
      }
    }
    for (const location of idGroup) {
      homeSet.add(location);
      groupMap.set(location, homeSet);
    }
  }

  // Plan merges for each group.
  const plans = [];
  for (const idGroup of new Set(groupMap.values())) {
    // Sort by oldest first, so that the oldest becomes the target all the
    // others merge into.
    const sorted = [...idGroup].sort((a, b) => a.created_at - b.created_at);
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
  }

  writeLog(`Removing ${removed} duplicates`);
  writeLog(`Adding IDs to ${updated} locations`);
}

async function main() {
  const commit = process.argv.includes("--commit");

  const locations = await loadLocations();
  const { byId, byExternalId } = groupLocations(locations);
  const plans = planChanges(byId, byExternalId);

  await doChanges(plans, commit);

  const mappingOutput = plans.flatMap(({ targetId, deleteLocations }) => {
    return deleteLocations.map((deleteId) => ({
      from_id: deleteId,
      to_id: targetId,
    }));
  });
  writeData(JSON.stringify(mappingOutput, null, 2));

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
