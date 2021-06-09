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

const Knex = require("knex");

const db = Knex({
  client: "postgresql",
  connection: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  },
  migrations: {
    tableName: "migrations",
  },
  pool: {
    afterCreate(conn, done) {
      // Ensure Postgres formats times in UTC.
      conn.query('SET timezone="UTC";', done);
    },
  },
});

function writeLog(...args) {
  console.warn(...args);
}

function writeData(text) {
  console.log(text);
}

async function loadLocations() {
  const locations = await db
    .select(
      "provider_locations.*",
      db.raw(
        "jsonb_object_agg(external_ids.system, external_ids.value) as external_ids"
      )
    )
    .from("provider_locations")
    .leftOuterJoin(
      "external_ids",
      "provider_locations.id",
      "external_ids.provider_location_id"
    )
    .groupBy("provider_locations.id");

  writeLog("Total locations:", locations.length);
  return locations;
}

function findDuplicates(locations) {
  const byId = new Map();
  const byExternalId = new Map();

  // Make a locations lookup and an external IDs lookup
  for (const location of locations) {
    byId.set(location.id, location);

    for (let [system, id] of Object.entries(location.external_ids)) {
      // Skip not-quite-unique systems
      if (system === "vtrcks") continue;
      // Skip internal identifiers
      if (system === "univaf_v0") continue;

      // Early seed data had this mistake in it, and that seed data got wrongly
      // loaded into production. No other entries use the "storeNumber" system,
      // so this is safe.
      if (system === "storeNumber") {
        system = "cvs";
        id = id.toString().padStart(5, "0");
      }

      const simpleId = `${system}:${id}`;
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
 * @param {Map} locations
 * @param {Map} byExternalId
 * @param {boolean} persist
 */
function planChanges(locations, byExternalId) {
  const toMerge = new Map();
  const toUpdate = new Map();

  for (const locations of byExternalId.values()) {
    // If there was only one locations for this external ID, we're good.
    if (locations.length === 1) continue;

    // Superset of all external IDs we want to store for the merged location.
    let allIds = [];
    for (const location of locations) {
      for (const [system, value] of Object.entries(location.external_ids)) {
        // These are bad IDs that should not be kept.
        if (system === "storeNumber") continue;

        allIds.push({ system, value });
      }
      // Keep track of the current ID for when things merge, too.
      allIds.push({ system: "univaf_v1", value: location.id });
    }

    const removed = [];
    let remaining = [];
    // Make sure we drop the one that has `storeNumber` if it's in the set.
    for (const location of locations) {
      if (location.external_ids.storeNumber) {
        removed.push(location);
      } else {
        remaining.push(location);
      }
    }

    // If one has already been marked for keeping, pull that out.
    let kept;
    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i];
      if (toUpdate.has(item.id)) {
        kept = item;
        allIds = allIds.concat(toUpdate.get(item.id).newIds);
        remaining.splice(i, 1);
        break;
      }
    }
    // Otherwise take the earliest created one.
    if (!kept) {
      remaining.sort((a, b) => a.created_at - b.created_at);
      kept = remaining.shift();
    }

    // Mark the rest for removal.
    for (const location of remaining) {
      // Sanity-check it's not marked to be kept elsewhere
      if (toUpdate.has(location.id)) {
        allIds = allIds.concat(toUpdate.get(location.id).newIds);
        toUpdate.delete(location.id);
        // Update any that were merging into this to now target what this is
        // merging into.
        for (const [mergeFrom, mergeTo] of [...toMerge.entries()]) {
          if (mergeTo === location.id) {
            toMerge.set(mergeFrom, kept.id);
            break;
          }
        }
      }

      removed.push(location);
    }

    for (const removable of removed) {
      const alreadyPlanned = toMerge.get(removable.id);
      // Handle situation where the location to be merged is already set to
      // merge into a different location.
      if (alreadyPlanned && alreadyPlanned !== kept.id) {
        // Find any others targeted at that location and re-target them here.
        for (const [mergeFrom, mergeTo] of [...toMerge.entries()]) {
          if (mergeTo === alreadyPlanned) toMerge.set(mergeFrom, kept.id);
        }
        // Add all the old merge target's IDs to our full ID set
        allIds = allIds.concat(toUpdate.get(alreadyPlanned).newIds);
        // Change the old merge target to merge into the new one here.
        toUpdate.delete(alreadyPlanned);
        toMerge.set(alreadyPlanned, kept.id);
      }
      toMerge.set(removable.id, kept.id);
    }

    toUpdate.set(kept.id, {
      location: kept,
      newIds: dedupeNewExternalIds(allIds, kept.id),
      newData: null,
    });
  }

  // Sanity check all the external ID pairs are unique
  const seenPairs = new Set();
  for (const { newIds } of toUpdate.values()) {
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

  // Merge other data fields.
  for (const [removableId, targetId] of toMerge.entries()) {
    const removable = locations.get(removableId);
    const target = toUpdate.get(targetId);
    let hasChanges = false;
    let newData = target.newData || {};

    for (const key in removable) {
      if (
        key !== "id_old" &&
        key !== "id" &&
        key !== "external_ids" &&
        newData[key] == null &&
        target.location[key] == null &&
        removable[key] != null
      ) {
        newData[key] = removable[key];
        hasChanges = true;
      }
    }

    if (hasChanges) target.newData = newData;
  }

  return { toUpdate, toMerge };
}

/**
 * @param {Map} toUpdate
 * @param {Map} toRemove
 * @param {boolean} persist
 */
async function doChanges(toUpdate, toMerge, persist = false) {
  const reverseMergeMap = new Map();
  for (const [mergeFrom, mergeTo] of toMerge.entries()) {
    let froms = reverseMergeMap.get(mergeTo);
    if (!froms) {
      froms = [];
      reverseMergeMap.set(mergeTo, froms);
    }
    froms.push(mergeFrom);
  }

  const remainingUpdates = new Map(toUpdate);
  for (const [mergeTo, mergeFroms] of reverseMergeMap.entries()) {
    writeLog("Merging into", mergeTo);
    for (const from of mergeFroms) writeLog("  from", from);
    const updates = remainingUpdates.get(mergeTo);
    if (updates) {
      remainingUpdates.delete(mergeTo);
      for (const newId of updates.newIds) {
        writeLog("  Adding ID:", JSON.stringify(newId));
      }
      if (updates.newData) {
        writeLog("  Updating fields:", JSON.stringify(updates.newData));
      }
    }

    if (persist) {
      await db.transaction(async (trx) => {
        // Add new external IDs
        if (updates) {
          await trx("external_ids")
            .insert(
              updates.newIds.map((newId) => ({
                ...newId,
                provider_location_id: mergeTo,
              }))
            )
            .onConflict(["provider_location_id", "system"])
            .merge();
        }

        // Merge main fields of provider_locations
        if (updates.newData) {
          await trx("provider_locations")
            .update(updates.newData)
            .where("id", mergeTo);
        }

        for (const from of mergeFroms) {
          // Copy newer availability entries
          const availabilities = await trx("availability").where({
            location_id: from,
          });
          for (const entry of availabilities) {
            delete entry.id;
            await trx("availability")
              .insert({
                ...entry,
                location_id: mergeTo,
              })
              .where("availability.checked_at", "<", entry.checked_at)
              .onConflict(["location_id", "source"])
              .merge();
          }

          // Delete from availability
          await trx("availability").where({ location_id: from }).delete();
          // Delete from external_ids
          await trx("external_ids")
            .where({ provider_location_id: from })
            .delete();
          // Delete from provider_locations
          await trx("provider_locations").where({ id: from }).delete();
        }
      });
    }
  }

  for (const [id, updates] of remainingUpdates.entries()) {
    writeLog("Updating", id);
    for (const newId of updates.newIds) {
      writeLog("  Adding ID:", JSON.stringify(newId));
    }
    if (persist) {
      await db("external_ids")
        .insert(
          updates.newIds.map((newId) => ({
            ...newId,
            provider_location_id: id,
          }))
        )
        .onConflict(["provider_location_id", "system"])
        .merge();
    }
  }

  writeLog(`Removing ${toMerge.size} duplicates`);
  writeLog(`Adding IDs to ${toUpdate.size} locations`);
}

function dedupeNewExternalIds(allIds, newId) {
  const v0Ids = new Set();
  const v1Ids = new Set();

  // Extract v0 and v1 IDs and dedupe their values.
  allIds = allIds.filter((id) => {
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

    allIds.push({ system, value });
  });
  index = 0;
  v1Ids.forEach((value) => {
    index++;
    let system = "univaf_v1";
    if (index > 1) system = `${system}_${index}`;

    allIds.push({ system, value });
  });

  // Remove duplicates.
  const seen = new Map();
  return allIds.filter((id) => {
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

async function main() {
  const commit = process.argv.includes("--commit");

  const locations = await loadLocations();
  const { byId, byExternalId } = findDuplicates(locations);
  const plan = planChanges(byId, byExternalId);

  await doChanges(plan.toUpdate, plan.toMerge, commit);

  const mappingOutput = [...plan.toMerge.entries()].map(([from_id, to_id]) => {
    return { from_id, to_id };
  });
  writeData(JSON.stringify(mappingOutput, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
