#!/usr/bin/env node
/**
 * Script for merging multiple locations together in the database.
 * See CLI help at bottom for complete description and options.
 */

import { type Knex } from "knex";
import yargs from "yargs";
import util from "node:util";
import { matchableAddress } from "univaf-common/address";
import { ProviderLocation } from "../src/interfaces";
import { createDbClient } from "../src/db-client";

// For historical reasons, this script uses a different format for external IDs
// than the rest of the server codebase.
export interface ScriptExternalId {
  system: string;
  value: string;
}

export interface ScriptLocation extends Omit<ProviderLocation, "external_ids"> {
  external_ids: ScriptExternalId[];
}

interface PlanDescription {
  address: string;
  text: string;
}

export interface MergePlan {
  targetId: string;
  newIds: ScriptExternalId[];
  newData?: any;
  deleteLocations: string[];
  description: PlanDescription;
  deleteDescriptions: PlanDescription[];
}

export const NON_MERGE_FIELDS = new Set([
  "id",
  "external_ids",
  "id_old",
  "created_at",
  "updated_at",
]);

export function writeLog(...args: any[]): void {
  console.warn(...args);
}

export const db = createDbClient("Scripts");

function getAddressString(location: ScriptLocation) {
  return `${location.address_lines?.join(", ")}, ${location.city}, ${
    location.state
  } ${location.postal_code}`;
}

export function locationsQuery(): Knex.QueryBuilder<any, ScriptLocation[]> {
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

async function loadLocation(id: string) {
  const location = await locationsQuery()
    .where("provider_locations.id", "=", id)
    .first();
  if (!location) {
    throw new Error(`Location not found: "${id}"`);
  }
  return location;
}

export function planMerge(...toMerge: ScriptLocation[]): MergePlan {
  const target = toMerge.shift();

  // Determine what fields to update
  let hasChanges = false;
  const newData: any = {};

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
      } else if (key === "is_public") {
        // If any of the locations is public, the merged result should be too.
        if (!target.is_public && source.is_public) {
          newData.is_public = true;
          hasChanges = true;
        }
      } else if (
        newData[key] == null &&
        target[key as keyof ScriptLocation] == null &&
        source[key as keyof ScriptLocation] != null
      ) {
        newData[key] = source[key as keyof ScriptLocation];
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
    description: {
      address: matchableAddress(getAddressString(target)),
      text: `${getAddressString(target)} // ${target.name}`,
    },
    deleteDescriptions: toMerge.map((x) => ({
      address: matchableAddress(getAddressString(x)),
      text: `${getAddressString(x)} // ${x.name}`,
    })),
  };
}

export function dedupeNewExternalIds(
  allExternalIds: ScriptExternalId[],
  newId: string
): ScriptExternalId[] {
  const seen = new Set();
  // Don't keep a reference to ourselves in the external IDs!
  return allExternalIds.filter(({ system, value }) => {
    if (system === "univaf_v1" && value === newId) {
      return false;
    }

    // Remove duplicates.
    const stringId = `${system}:${value}`;
    if (seen.has(stringId)) {
      return false;
    }
    seen.add(stringId);
    return true;
  });
}

export async function doMerge(plan: MergePlan, persist = false): Promise<void> {
  writeLog("Merging into", plan.targetId, `(${plan.description.text})`);

  plan.deleteLocations.forEach((from, index) => {
    writeLog("  from      ", from, `(${plan.deleteDescriptions[index].text})`);
  });

  writeLog(
    "  IDs:",
    plan.newIds
      .map((id) => `${id.system}:${id.value}`)
      .sort()
      .join("\n       ")
  );

  if (plan.newData) {
    writeLog("  Updating fields:", JSON.stringify(plan.newData));
  }

  for (const description of plan.deleteDescriptions) {
    if (description.address !== plan.description.address) {
      writeLog("  WARNING: Locations have different addresses.");
      break;
    }
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
          .onConflict(["provider_location_id", "system", "value"])
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

async function main(
  args: yargs.ArgumentsCamelCase<{
    commit: boolean;
    IDs: string[];
  }>
) {
  if (!args.IDs || args.IDs.length < 2) {
    writeLog("Please specify at least two locations to merge.");
    process.exitCode = 1;
    return;
  }

  const locations = await Promise.all(args.IDs.map((id) => loadLocation(id)));
  const plan = planMerge(...locations);
  await doMerge(plan, args.commit);

  if (!args.commit) {
    writeLog("");
    writeLog("This is a plan. Run with --commit to actually make changes.");
  }

  await db.destroy();
}

if (require.main === module) {
  yargs
    .scriptName("merge-locations")
    .command({
      command: "$0 [IDs...]",
      describe: `
        Merge multiple location records from the database. Pass the IDs of the
        locations to be merged as positional arguments. The first ID is the
        location that others will be merged into:

            $ scripts/merge-locations.js <id_1> <id_2> <id_3> ...etc...

        The first location
        will be given all the external IDs and availability records of
        the others, and the others will be deleted. The IDs of the old locations
        are preserved as a "univaf_v1" external ID on the remaining location.

        Old, "univaf_v0" IDs are preserved on the remaining, merged location in
        the same way as described above for v1 IDs.

        By default, this prints a plan of the steps it's going to take, but does
        not alter the contents of the database. Add the '--commit' option to
        actually make the changes.
      `.trim(),
      builder: (yargs) =>
        yargs.option("commit", {
          type: "boolean",
          describe: `
              Actually upate records in the database. If this option is not set,
              the script will print a plan for what it will delete or update,
              but not actually take any action.
            `.trim(),
        }),
      handler: main,
    })
    .help()
    .parse();
}
