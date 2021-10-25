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

const MULTIPLE_SPACE_PATTERN = /[\n\s]+/g;
const PUNCTUATION_PATTERN = /[.,;\-–—'"“”‘’`!()/\\]+/g;
const POSSESSIVE_PATTERN = /['’]s /g;
const ADDRESS_LINE_DELIMITER_PATTERN = /,|\n|\s-\s/g;

// Common abbreviations in addresses and their expanded, full English form.
// These are used to match similar addresses. For example:
//   For example: "600 Ocean Hwy" and "600 Ocean Highway"
// They're always used in lower-case text where punctuation has been removed.
// In some cases, the replacements *remove* the abbreviation entirely to enable
// better loose matching (usually for road types, like "road" vs. "street").
const ADDRESS_EXPANSIONS = [
  [/ i /g, " interstate "],
  [/ i-(\d+) /g, " interstate $1 "],
  [/ expy /g, " expressway "],
  [/ fwy /g, " freeway "],
  [/ hwy /g, " highway "],
  [/ (u s|us) /g, " "], // Frequently in "U.S. Highway / US Highway"
  [/ (s r|sr|st rt|state route|state road) /g, " route "],
  [/ rt /g, " route "],
  [/ (tpke?|pike) /g, " turnpike "],
  [/ ft /g, " fort "],
  [/ mt /g, " mount "],
  [/ mtn /g, " mountain "],
  [/ (is|isl|island) /g, " "],
  [/ n /g, " north "],
  [/ s /g, " south "],
  [/ e /g, " east "],
  [/ w /g, " west "],
  [/ nw /g, " northwest "],
  [/ sw /g, " southwest "],
  [/ ne /g, " northeast "],
  [/ se /g, " southeast "],
  [/ ave? /g, " "],
  [/ avenue? /g, " "],
  [/ dr /g, " "],
  [/ drive /g, " "],
  [/ rd /g, " "],
  [/ road /g, " "],
  [/ st /g, " "],
  [/ street /g, " "],
  [/ saint /g, " "], // Unfortunately, this gets mixed in with st for street.
  [/ blvd /g, " "],
  [/ boulevard /g, " "],
  [/ ln /g, " "],
  [/ lane /g, " "],
  [/ cir /g, " "],
  [/ circle /g, " "],
  [/ ct /g, " "],
  [/ court /g, " "],
  [/ cor /g, " "],
  [/ corner /g, " "],
  [/ (cmn|common|commons) /g, " "],
  [/ ctr /g, " "],
  [/ center /g, " "],
  [/ pl /g, " "],
  [/ place /g, " "],
  [/ plz /g, " "],
  [/ plaza /g, " "],
  [/ pkw?y /g, " "],
  [/ parkway /g, " "],
  [/ cswy /g, " "],
  [/ causeway /g, " "],
  [/ byp /g, " "],
  [/ bypass /g, " "],
  [/ mall /g, " "],
  [/ (xing|crssng) /g, " "],
  [/ crossing /g, " "],
  [/ sq /g, " "],
  [/ square /g, " "],
  [/ trl? /g, " "],
  [/ trail /g, " "],
  [/ (twp|twsp|townsh(ip)?) /g, " "],
  [/ est(ate)? /g, " estates "],
  [/ vlg /g, " "], // village
  [/ village /g, " "],
  [/ (ste|suite|unit|apt|apartment) #?(\d+) /g, " $1 "],
  [/ #?(\d+) /g, " $1 "],
  [/ (&|and) /g, " "],
];

/**
 * Simplify a text string (especially an address) as much as possible so that
 * it might match with a similar string from another source.
 * @param {string} text
 * @returns {string}
 */
function matchable(text) {
  return text
    .toLowerCase()
    .replace(POSSESSIVE_PATTERN, " ")
    .replace(PUNCTUATION_PATTERN, " ")
    .replace(MULTIPLE_SPACE_PATTERN, " ")
    .trim();
}

function matchableAddress(text, line = null) {
  let lines = Array.isArray(text)
    ? text
    : text.split(ADDRESS_LINE_DELIMITER_PATTERN);

  // If there are multiple lines and it looks like the first line is the name
  // of a place (rather than the street), drop the first line.
  if (lines.length > 1 && !/\d/.test(lines[0])) {
    lines = lines.slice(1);
  }

  if (line != null) {
    lines = lines.slice(line, line + 1);
  }

  let result = matchable(lines.join(" "));
  for (const [pattern, expansion] of ADDRESS_EXPANSIONS) {
    result = result.replace(pattern, expansion);
  }

  return result.replace(MULTIPLE_SPACE_PATTERN, " ").trim();
}

function getAddressString(location) {
  return `${location.address_lines.join(", ")}, ${location.city}, ${
    location.state
  } ${location.postal_code}`;
}

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

function dedupeNewExternalIds(allExternalIds, newId) {
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

async function doMerge(plan, persist = false) {
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
  matchableAddress,
};

if (require.main === module) {
  main(process.argv.slice(2))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => db.destroy());
}
