#!/usr/bin/env node
/**
 * Script for merging multiple locations together in the database.
 *
 * Call it with the IDs of the locations to be merged. The first ID is the
 * location that others will be merged into:
 *
 *     $ scripts/merge-locations.js <id_1> <id_2> <id_3> ...etc...
 *
 * By default, this prints a plan of the steps it's going to take, but does not
 * alter the contents of the database. Add the `--commit` option to actually
 * make the changes.
 *
 * At the end of the run, a JSON object will be printed on STDOUT that maps
 * old to new IDs for records that were merged.
 *
 * Merging means one location will be given all the external IDs and
 * availability records of the others, and the others will be deleted. The IDs
 * of the old locations are preserved as a `univaf_v1` external ID on the
 * remaining location. If more than one is merged, their external IDs will have
 * an incrementing number on the end, e.g. `univaf_v1`, `univaf_v1_2`,
 * `univaf_v1_3`.
 *
 * Old, `univaf_v0` IDs are preserved on the remaining, merged location in the
 * same way as described above for v1 IDs.
 */

const Knex = require("knex");
const util = require("util");

const NON_MERGE_FIELDS = new Set([
  "id",
  "external_ids",
  "id_old",
  "created_at",
  "updated_at",
]);

function writeLog(...args) {
  console.warn(...args);
}

const environment = process.env.NODE_ENV || "development";
const db = Knex(require("../knexfile")[environment]);

function locationsQuery() {
  return db
    .select(
      "provider_locations.*",
      db.raw(`
        jsonb_agg(jsonb_build_object(
          'system', external_ids.system,
          'value', external_ids.value
        )) as external_ids
      `)
    )
    .from("provider_locations")
    .leftOuterJoin(
      "external_ids",
      "provider_locations.id",
      "external_ids.provider_location_id"
    )
    .groupBy("provider_locations.id");
}

async function loadLocation(id) {
  return await locationsQuery().where("provider_locations.id", "=", id).first();
}

function planMerge(target, ...toMerge) {
  // Determine what fields to update
  let hasChanges = false;
  const newData = {};

  for (const source of toMerge) {
    for (const key in source) {
      if (NON_MERGE_FIELDS.has(key)) continue;

      if (key === "meta") {
        const meta = {
          ...source.meta,
          ...newData.meta,
          ...target.meta,
        };
        if (!util.isDeepStrictEqual(meta || {}, target.meta || {})) {
          newData.meta = meta;
          hasChanges = true;
        }
      } else if (
        newData[key] == null &&
        target[key] == null &&
        source[key] != null
      ) {
        newData[key] = source[key];
        hasChanges = true;
      }
    }
  }

  // Determine new set of external IDs
  const allIds = [target, ...toMerge].flatMap((x) => [
    { system: "univaf_v1", value: x.id },
    ...x.external_ids,
  ]);
  const newIds = dedupeNewExternalIds(allIds, target.id);

  return {
    targetId: target.id,
    newIds,
    newData: hasChanges ? newData : undefined,
    deleteLocations: toMerge.map((x) => x.id),
  };
}

function dedupeNewExternalIds(allExternalIds, newId) {
  const v0Ids = new Set();
  const v1Ids = new Set();

  // Extract v0 and v1 IDs and dedupe their values.
  allExternalIds = allExternalIds.filter((id) => {
    if (id.system.startsWith("univaf_v0")) {
      v0Ids.add(id.value);
      return false;
    } else if (id.system.startsWith("univaf_v1")) {
      v1Ids.add(id.value);
      return false;
    }
    return true;
  });

  // Don't keep a reference to ourselves in the external IDs!
  v1Ids.delete(newId);

  // Add the v0/v1 IDs back it an integer on the system name to allow for more
  // than one as v0/v1.
  let index = 0;
  v0Ids.forEach((value) => {
    index++;
    let system = "univaf_v0";
    if (index > 1) system = `${system}_${index}`;

    allExternalIds.push({ system, value });
  });
  index = 0;
  v1Ids.forEach((value) => {
    index++;
    let system = "univaf_v1";
    if (index > 1) system = `${system}_${index}`;

    allExternalIds.push({ system, value });
  });

  // Remove duplicates.
  const seen = new Map();
  return allExternalIds.filter((id) => {
    // Remove duplicates and sanity check.
    const existing = seen.get(id.system);
    if (existing) {
      if (existing !== id.value) {
        // Special case a known, OK scenario because of bad data in NJVSS
        const badPair = ["10907:WALMART_2582", "10882:WALMART_2582"];
        if (badPair.includes(existing) && badPair.includes(id.value)) {
          // Just filter one out.
          return false;
        }

        // Bail out if we need to set the same system to multiple values.
        throw new Error(
          `Multiple values for system "${id.system}": ("${id.value}", "${existing}")`
        );
      } else {
        // Drop it if it's just a duplicate.
        return false;
      }
    } else {
      seen.set(id.system, id.value);
      return true;
    }
  });
}

async function doMerge(plan, persist = false) {
  writeLog("Merging into", plan.targetId);

  for (const from of plan.deleteLocations) writeLog("  from", from);

  for (const newId of plan.newIds) {
    writeLog("  Adding ID:", JSON.stringify(newId));
  }
  if (plan.newData) {
    writeLog("  Updating fields:", JSON.stringify(plan.newData));
  }

  if (persist) {
    await db.transaction(async (trx) => {
      // Add new external IDs
      if (plan.newIds) {
        await trx("external_ids")
          .insert(
            plan.newIds.map((newId) => ({
              ...newId,
              provider_location_id: plan.targetId,
            }))
          )
          .onConflict(["provider_location_id", "system"])
          .merge();
      }

      // Merge main fields of provider_locations
      await trx("provider_locations")
        .update({
          ...plan.newData,
          updated_at: new Date(),
        })
        .where("id", plan.targetId);

      for (const deleteId of plan.deleteLocations) {
        // Copy newer availability entries
        const availabilities = await trx("availability").where({
          location_id: deleteId,
        });
        for (const entry of availabilities) {
          delete entry.id;
          await trx("availability")
            .insert({
              ...entry,
              location_id: plan.targetId,
            })
            .where("availability.checked_at", "<", entry.checked_at)
            .onConflict(["location_id", "source"])
            .merge();
        }

        // Delete from availability
        await trx("availability").where({ location_id: deleteId }).delete();
        // Delete from external_ids
        await trx("external_ids")
          .where({ provider_location_id: deleteId })
          .delete();
        // Delete from provider_locations
        await trx("provider_locations").where({ id: deleteId }).delete();
      }
    });
  }
}

async function main(args) {
  const ids = args.filter((arg) => !arg.startsWith("--"));
  const options = args.filter((arg) => arg.startsWith("--"));
  const commit = options.includes("--commit");

  if (ids.length < 2) {
    writeLog("Please specify at least two locations to merge.");
    process.exitCode = 1;
    return;
  }

  const locations = await Promise.all(ids.map((id) => loadLocation(id)));
  const plan = planMerge(...locations);
  await doMerge(plan, commit);

  if (!commit) {
    writeLog("");
    writeLog("This is a plan. Run with --commit to actually make changes.");
  }
}

module.exports = {
  NON_MERGE_FIELDS,
  db,
  locationsQuery,
  dedupeNewExternalIds,
  planMerge,
  doMerge,
};

if (require.main === module) {
  main(process.argv.slice(2))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => db.destroy());
}
