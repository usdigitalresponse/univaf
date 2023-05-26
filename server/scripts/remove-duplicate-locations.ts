#!/usr/bin/env node
/**
 * Merge duplicate locations from the database based on their external IDs.
 * See CLI help at bottom for complete description and options.
 */

import assert from "node:assert";
import yargs from "yargs";
import {
  db,
  planMerge,
  doMerge,
  locationsQuery,
  writeLog,
  ScriptLocation,
  MergePlan,
} from "./merge-locations";

/**
 * Group locations by external ID. Locations will appear in more than one group
 * if more than one external ID is shared.
 */
export function groupByExternalId(
  locations: ScriptLocation[],
  systems: string[] = null,
  unpadIds = false
): Map<string, Set<ScriptLocation>> {
  const byExternalId = new Map();

  // Make a locations lookup and an external IDs lookup
  for (const location of locations) {
    for (const { system, value } of location.external_ids) {
      // Skip not-quite-unique systems
      if (system === "vtrcks") continue;
      if (system === "npi_usa") continue;
      // Skip internal identifiers
      if (system === "univaf_v0") continue;
      if (system === "univaf_v1") continue;

      // Only for specified systems
      if (systems?.length && !systems.includes(system)) continue;

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
export function mergeGroupsWithCommonLocations<T>(
  groups: Map<string, Set<T> | Array<T>>
): Set<T>[] {
  return (
    [...groups.values()]
      // Skip groups that don't represent duplicates.
      .filter((items) => (items instanceof Set ? items.size : items.length) > 1)
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
export function groupDuplicateLocations(
  locations: ScriptLocation[],
  systems: string[] = null,
  unpadIds = false
): Set<ScriptLocation>[] {
  const byExternalId = groupByExternalId(locations, systems, unpadIds);
  return mergeGroupsWithCommonLocations(byExternalId);
}

/**
 * Create a merge plan for each group that needs to be merged.
 */
function planChanges(mergeGroups: Set<ScriptLocation>[]) {
  // Plan merges for each group.
  const plans = [];
  for (const group of mergeGroups) {
    // Sort by oldest first, so that the oldest becomes the target all the
    // others merge into.
    const sorted = [...group].sort(
      (a, b) => a.created_at.getTime() - b.created_at.getTime()
    );
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

async function doChanges(plans: MergePlan[], persist = false) {
  let removed = 0;
  let updated = 0;
  for (const plan of plans) {
    updated++;
    removed += plan.deleteLocations.length;
    await doMerge(plan, persist);
    writeLog("");
  }

  return { removed, updated };
}

export async function main({
  unpad = false,
  commit = false,
  system = [],
  ..._
}: {
  unpad?: boolean;
  commit?: boolean;
  system?: (string | number)[];
}): Promise<void> {
  assert.ok(
    system.every((s) => typeof s === "string"),
    "Systems must all be strings"
  );

  const locations = await locationsQuery();
  writeLog("Total locations:", locations.length);
  const duplicates = groupDuplicateLocations(
    locations,
    system as string[],
    unpad
  );
  const plans = planChanges(duplicates);

  const { removed, updated } = await doChanges(plans, commit);

  writeLog(`Removed ${removed} duplicates`);
  writeLog(`Added to ${updated} locations`);
  writeLog("");
  if (commit) {
    writeLog(`Updated ${removed + updated} location records`);
  } else {
    writeLog("This is a plan. Run with --commit to actually make changes.");
  }

  await db.destroy();
}

if (require.main === module) {
  yargs
    .scriptName("remove-duplicate-locations")
    .command({
      command: "$0",
      describe: `
        Merge duplicate locations from the database based on their external IDs.

        By default, this prints a plan of the steps it's going to take, but does
        not alter the contents of the database. Add the '--commit' option to
        actually make the changes.

        Multiple locations with the same external ID will get "merged" -- one
        location will be given all the external IDs and availability records of
        the others, and the others will be deleted. The IDs of the old locations
        are preserved as a "univaf_v1" external ID on the remaining location.

        Old, "univaf_v0" IDs are preserved on the remaining, merged location in
        the same way as described above for v1 IDs.
      `.trim(),
      builder: (yargs) =>
        yargs
          .option("unpad", {
            type: "boolean",
            describe: `
              Check non-zero-padded versions of numeric IDs instead of looking
              for exact matches. For example, this will cause the IDs
              "kroger:123" and "kroger:0123" to match.
            `.trim(),
          })
          .option("commit", {
            type: "boolean",
            describe: `
              Actually remove duplicates in the database. If this option is not
              set, the script will print a plan for what it will delete or
              update, but not actually take any action.
            `.trim(),
          })
          .option("system", {
            type: "array",
            describe: `
              Only check a specific ID system for duplicates. Repeat this option
              to list more than one to check. For example, to only check Kroger
              and CVS IDs, use: "--system kroger --system cvs".
            `.trim(),
          }),
      handler: (args) => main(args),
    })
    .help()
    .parse();
}
