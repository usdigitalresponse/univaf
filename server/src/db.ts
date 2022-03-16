import _ from "lodash";
import { strict as assert } from "assert";
import {
  Availability,
  AvailabilityInput,
  ExternalIdList,
  Position,
  ProviderLocation,
  LocationAvailability,
} from "./interfaces";
import { NotFoundError, OutOfDateError, ValueError } from "./exceptions";
import Knex from "knex";
import { validateAvailabilityInput, validateLocationInput } from "./validation";
import { loadDbConfig } from "./config";
import { UUID_PATTERN } from "./utils";
import { logger, logStackTrace } from "./logger";

import * as Sentry from "@sentry/node";
import * as availabilityLog from "./availability-log";
import { isDeepStrictEqual } from "util";

// When locations are queried in batches (e.g. when iterating over extremely
// large result sets), query this many records at a time.
const DEFAULT_BATCH_SIZE = 2000;

// It's possible for some sources to have availability records that are recent,
// while others might be weeks old or more (e.g. this might happen if a source
// was disabled).
// When merging records from multiple sources, we only include records from
// within this many milliseconds of each other.
const AVAILABILITY_MERGE_TIMEFRAME = 48 * 60 * 60 * 1000;

export const db = Knex(loadDbConfig());

const providerLocationFields = [
  "id",
  "provider",
  "location_type",
  "name",
  "address_lines",
  "city",
  "state",
  "postal_code",
  "county",
  "position",
  "info_phone",
  "info_url",
  "booking_phone",
  "booking_url",
  "description",
  "requires_waitlist",
  "meta",
  "created_at",
  "updated_at",
];

const providerLocationPrivateFields = ["is_public", "internal_notes"];

const providerLocationAllFields = providerLocationFields.concat(
  providerLocationPrivateFields
);

function formatSqlPoint(point?: Position) {
  return point ? `point(${point.longitude} ${point.latitude})` : point;
}

function selectSqlPoint(column: string): string {
  return `
  CASE WHEN ${column} is null THEN null
  ELSE
    json_build_object(
      'longitude', st_x(${column}::geometry),
      'latitude', st_y(${column}::geometry)
    )
  END as position
  `.trim();
}

/**
 * Create a provider location.
 * @param data ProviderLocation-like object with data to insert
 */
export async function createLocation(data: any): Promise<ProviderLocation> {
  data = validateLocationInput(data, true);

  const now = new Date();
  const sqlData: { [index: string]: string } = {
    ...data,
    position: formatSqlPoint(data.position),
    created_at: now,
    updated_at: now,
  };

  if (!UUID_PATTERN.test(sqlData.id)) {
    // the database will auto-assign a random uuid
    delete sqlData.id;
  }

  const sqlFields = Object.entries(sqlData).filter(([key, _]) => {
    return providerLocationAllFields.includes(key);
  });

  const locationId = await db.transaction(async (tx) => {
    const inserted = await tx.raw(
      `INSERT INTO provider_locations (
      ${sqlFields.map((x) => x[0]).join(", ")}
    )
    VALUES (${sqlFields.map((_) => "?").join(", ")})
    RETURNING id`,
      sqlFields.map((x) => x[1] ?? null)
    );

    const locationId = inserted.rows[0].id;
    await addExternalIds(locationId, data.external_ids, tx);
    return locationId;
  });
  return await getLocationById(locationId, { includePrivate: true });
}

/**
 * Set external ids for a provider location.
 * @param dbConn connection to the database (db object or transaction object)
 * @param id Provider location ID
 * @param externalIds [[system, value]]
 */
export async function addExternalIds(
  id: string,
  externalIds: ExternalIdList,
  dbConn: typeof db = db
): Promise<void> {
  const toInsert = _.uniqBy(externalIds, (pair) => JSON.stringify(pair));
  await dbConn("external_ids")
    .insert(
      toInsert.map(([system, value]: [string, string]) => {
        if (system.includes(":")) {
          throw new ValueError(
            `Provider location ${id} externalIds include ${system} \
            but ':' is not allowed`.replace(/\n\s*/g, " ")
          );
        }
        return {
          provider_location_id: id,
          system,
          value,
        };
      })
    )
    .onConflict(["provider_location_id", "system", "value"])
    .merge();
}

/**
 * Update data about a provider location.
 * @param location ProviderLocation
 * @param data ProviderLocation-like object with data to update
 */
export async function updateLocation(
  location: ProviderLocation,
  data: any,
  { mergeSubfields = true } = {}
): Promise<void> {
  data = validateLocationInput(data);
  const sqlData: any = { updated_at: new Date() };

  for (let [key, value] of Object.entries(data)) {
    if (key == "position") {
      value = formatSqlPoint(data.position);
    }

    if (key == "meta" && mergeSubfields) {
      value = db.raw('"meta" || ?', JSON.stringify(data.meta));
    }

    if (key != "id" && providerLocationAllFields.includes(key)) {
      sqlData[key] = value;
    }
  }

  await db.transaction(async (tx) => {
    await tx("provider_locations").where("id", location.id).update(sqlData);

    if ("external_ids" in data) {
      await addExternalIds(location.id, data.external_ids, tx);
    }
  });
}

/**
 * Lists all provider locations.
 * @param includePrivate Whether to include non-public locations.
 */
export async function listLocations({
  includePrivate = false,
  limit = 0,
  where = [] as string[],
  values = [] as any[],
  sources = [] as string[],
} = {}): Promise<ProviderLocation[]> {
  let fields = providerLocationFields;

  if (includePrivate) {
    fields = fields.concat(providerLocationPrivateFields);
  } else {
    where.push(`pl.is_public = true`);
  }

  // Reformat fields as select expressions to get the right data back.
  fields = fields
    .map((name) => `pl.${name}`)
    .map((name) => (name === "pl.position" ? selectSqlPoint(name) : name));

  let result;
  try {
    result = await db.raw(
      `
      SELECT ${fields.join(", ")}
      FROM provider_locations pl
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY pl.created_at ASC, pl.id ASC
      ${limit ? `LIMIT ${limit}` : ""}
      `,
      values || []
    );
  } catch (error) {
    // If it was just a malformed UUID, treat that like no results.
    if (error.routine === "string_to_uuid") return [];

    throw error;
  }

  const locationIds = result.rows.map((r: any) => r.id);
  const externalIds = await getExternalIdsByLocation(locationIds);
  const availabilities = await getCurrentAvailabilityByLocation(
    locationIds,
    includePrivate,
    sources
  );

  return result.rows.map((row: any) => {
    row.external_ids = externalIds[row.id] || [];
    row.availability = availabilities.get(row.id);

    if (row.availability) {
      delete row.availability.id;
      delete row.availability.location_id;
      delete row.availability.is_public;
      delete row.availability.rank;
    }

    return row;
  });
}

interface LocationBatch {
  locations: ProviderLocation[];
  next: string;
}

/**
 * Yield batches of locations, ultimately iterating through the entire table
 * (unless `limit` is set, in which case it will yield only that many records).
 * This lets us have long-running connections that stream out results, but that
 * do not tie up the database.
 *
 * If a client needs to pause and restart later, they can use the `next`
 * property in each yielded batch. It can be passed into this function as the
 * `start` parameter, and iteration will resume from the next record.
 *
 * @example
 * let nextKey;
 * for await (const batch of iterateLocationBatches()) {
 *   if (needToPause) {
 *     nextKey = batch.next;
 *     break;
 *   }
 * }
 * // resume from where the above iterator left off:
 * for await (const batch of iterateLocationBatches({ start: nextKey })) {
 *   // do something
 * }
 */
export async function* iterateLocationBatches({
  includePrivate = false,
  batchSize = DEFAULT_BATCH_SIZE,
  limit = 0,
  start = "",
  where = [] as string[],
  values = [] as any[],
  sources = [] as string[],
} = {}): AsyncGenerator<LocationBatch> {
  assert(Number.isInteger(batchSize) && batchSize > 0, "batchSize must be > 0");
  assert(Number.isInteger(limit) && limit >= 0, "limit must be >= 0");

  // Keep track of the query conditions for the current batch of results.
  let batchWhere = where;
  let batchValues = values;
  let nextValues: Array<any>;

  // Parse a key for where to start. This should be a `batch.next` value from
  // one of the batches this iterator yields.
  if (start) {
    nextValues = start.split(",").map((x) => x.trim());
    if (nextValues.length !== 2) {
      throw new ValueError("malformed pagination key", { value: start });
    }
  }

  let total = 0;
  while (true) {
    if (limit) {
      assert(total <= limit, "total should never exceed limit");
      // Shrink the batch size if it would go over the total limit.
      batchSize = Math.min(batchSize, limit - total);
    }

    if (nextValues) {
      batchWhere = where.concat(["(pl.created_at, pl.id) > (?, ?)"]);
      batchValues = values.concat(nextValues);
    }

    const batch: Array<ProviderLocation> = await listLocations({
      includePrivate,
      where: batchWhere,
      values: batchValues,
      limit: batchSize,
      sources,
    });

    total += batch.length;
    if (batch.length < batchSize) {
      nextValues = null;
    } else {
      nextValues = [
        batch[batch.length - 1].created_at.toISOString(),
        batch[batch.length - 1].id,
      ];
    }

    yield {
      locations: batch,
      next: nextValues && nextValues.join(","),
    };

    // Stop if there is no more data or if we've reached the maximum requested.
    if (!nextValues || total === limit) break;
  }
}

/**
 * Returns a single provider location based upon its id (or undefined).
 * @param id
 * @returns ProviderLocation | undefined
 */
export async function getLocationById(
  id: string,
  { includePrivate = false, sources = [] as string[] } = {}
): Promise<ProviderLocation | undefined> {
  if (!UUID_PATTERN.test(id)) return;

  const rows = await listLocations({
    includePrivate,
    limit: 1,
    where: ["pl.id = ?"],
    values: [id],
    sources,
  });
  return rows[0];
}

/**
 * Returns a single provider location that has at least one external ID matching
 * one of the provided IDs.
 * @param external_ids
 * @returns ProviderLocation | undefined
 */
export async function getLocationByExternalIds(
  externalIds: ExternalIdList,
  { includePrivate = false, includeExternalIds = false } = {}
): Promise<ProviderLocation | undefined> {
  // Some IDs are not unique enough to identify a single location (e.g.
  // VTrckS PINs), so remove them from the set of external IDs to query.
  // (It's a bit of a historical mistake that these are here instead of in
  // the `meta` field.)
  const queryableIds = externalIds.filter(([system, _]) => {
    return system !== "vtrcks" && system !== "npi_usa";
  });

  // Bail out early if there was nothing to actually query on.
  if (!queryableIds.length) return null;

  // Determine the fields to select.
  let fields: Array<any> = providerLocationFields;
  if (includePrivate) {
    fields = fields.concat(providerLocationPrivateFields);
  }

  const location = await db("provider_locations")
    .join(
      "external_ids",
      "external_ids.provider_location_id",
      "provider_locations.id"
    )
    .select(
      fields.map((name) => {
        name = `provider_locations.${name}`;
        // Ensure we return geo coordinates in an easy-to-handle format.
        return name === "provider_locations.position"
          ? db.raw(selectSqlPoint(name))
          : name;
      })
    )
    .modify((builder) => {
      if (!includePrivate) builder.where("is_public", true);
    })
    .andWhere((builder) => {
      for (const [system, id] of queryableIds) {
        builder.orWhere((builder) => {
          builder
            .where("external_ids.system", "=", system)
            .andWhere("external_ids.value", "=", id);
        });
      }
    })
    .first();

  if (location && includeExternalIds) {
    const externalIds = await getExternalIdsByLocation(location.id);
    location.external_ids = externalIds[location.id];
  }

  return location;
}

interface ExternalIdsByLocation {
  [locationId: string]: ExternalIdList;
}
/**
 * Returns a mapping of provider location id to external ids
 * @param locationIds (string | string[])
 * @returns ExternalIdsByLocation
 */
export async function getExternalIdsByLocation(
  locationIds: string | string[]
): Promise<ExternalIdsByLocation> {
  const selectIds = Array.isArray(locationIds) ? locationIds : [locationIds];

  const rows = await db("external_ids")
    .select("provider_location_id", "system", "value")
    .whereIn("provider_location_id", selectIds);

  const out: ExternalIdsByLocation = {};
  for (const row of rows) {
    if (!(row.provider_location_id in out)) {
      out[row.provider_location_id] = [];
    }

    out[row.provider_location_id].push([row.system, row.value]);
  }

  return out;
}

/**
 * Merge multiple location availability records together.
 * @param records List of availabilities to merge. Fields from records earlier
 *        in the list are chosen over those from records later in the list.
 */
function mergeAvailabilities(
  records: LocationAvailability[]
): LocationAvailability {
  if (!records || records.length === 0) return undefined;

  const merged: any = { sources: [] as string[] };
  const baseTime = records[0].valid_at;
  const unknownRecords: LocationAvailability[] = [];
  const goodRecords = records.filter((record) => {
    // Records that come from vastly different points in time probably shouldn't
    // be merged together and are more likely to be in conflict, so filter much
    // older records.
    if (
      baseTime.getTime() - record.valid_at.getTime() >
      AVAILABILITY_MERGE_TIMEFRAME
    ) {
      return false;
    }

    // Set unknown availability results aside to add to the end of the list.
    if (record.available === Availability.UNKNOWN) {
      unknownRecords.push(record);
      return false;
    }
    return true;
  });
  goodRecords.push(...unknownRecords);

  for (const record of goodRecords) {
    for (const key in record) {
      if (key === "id" || key === "location_id") continue;

      const value = (record as any)[key];
      if (key === "source") {
        merged.sources.push(value);
      } else if (merged[key] == null && value != null) {
        merged[key] = value;
      }
    }
  }

  // Make sure `available` and `available_count` match up, since they could have
  // come from different records.
  if (merged.available_count && merged.available === Availability.NO) {
    merged.available_count = 0;
  }

  return merged;
}

/**
 * Returns a mapping of provider location id to external ids
 * @param locationIds (string | string[])
 * @returns ExternalIdsByLocation
 */
export async function getCurrentAvailabilityByLocation(
  locationIds: string | string[],
  includePrivate = false,
  sources?: string[]
): Promise<Map<string, LocationAvailability>> {
  const selectIds = Array.isArray(locationIds) ? locationIds : [locationIds];
  const rows = await db("availability")
    .whereIn("location_id", selectIds)
    .modify((builder) => {
      if (!includePrivate) builder.where("is_public", true);
      if (sources && sources.length > 0) builder.whereIn("source", sources);
    })
    .orderBy(["location_id", { column: "valid_at", order: "desc" }]);

  const result = new Map<string, LocationAvailability>();
  const groups = new Map<string, LocationAvailability[]>();
  for (const row of rows) {
    if (!groups.has(row.location_id)) {
      groups.set(row.location_id, []);
    }
    groups.get(row.location_id).push(row);
  }
  for (const [id, rows] of groups.entries()) {
    result.set(id, mergeAvailabilities(rows));
  }

  return result;
}

/**
 * Updates a given location's availability. If neither `checked_at` nor
 * `valid_at` are newer than an existing availibility record for the given
 * location and source, this will throw `OutOfDateError`.
 *
 * Specifically:
 * - Updates with newer `checked_at` but the same `valid_at` are OK. This
 *   indicates the source was checked, but it hadn't been updated since the last
 *   check.
 * - Updates with the same `checked_at` but newer `valid_at` times are also OK.
 *   This accomodates sources that may surface multiple records for the same
 *   location, but with different valid times.
 * - If *both* `checked_at` and `valid_at` are unchanged or if they are older,
 *   the update will fail.
 * @param id
 * @param availability
 * @returns
 */
export async function updateAvailability(
  id: string,
  data: AvailabilityInput
): Promise<{ action: string; locationId: string }> {
  data = validateAvailabilityInput(data);
  const {
    source,
    available = Availability.UNKNOWN,
    checked_at,
    valid_at,
    available_count = null,
    products = null,
    doses = null,
    capacity = null,
    slots = null,
    meta = null,
    is_public = true,
  } = data;

  let loggableUpdate = data;

  // FIXME: Do everything here in one PG call with INSERT ... ON CONFLICT ...
  // or wrap this in a PG advisory lock to keep consistent across calls.
  const existingAvailability = await db("availability")
    .where({ location_id: id, source })
    .first();

  let result;
  let changed_at;
  if (existingAvailability) {
    // The actual data we want to update varies based on how or if things have
    // changed (new check time, new valid time, new actual data).
    let updateData;
    // Since we don't have a lock, it's also possible for a newer update to
    // come through while handling this update. The query needs conditions on
    // `checked_at` and optionally `valid_at` (depending what's in `updateData`)
    // to ensure we don't overwrite an update that happened during this one.
    let updateQuery = db("availability")
      .where("id", existingAvailability.id)
      .andWhere("checked_at", "<=", checked_at);

    // Convert to numeric timestamps to support equality comparisons.
    const existingCheckedTime = existingAvailability.checked_at.getTime();
    const existingValidTime = existingAvailability.valid_at.getTime();
    const checkedTime = new Date(checked_at).getTime();
    const validTime = new Date(valid_at).getTime();

    if (
      existingCheckedTime > checkedTime ||
      existingValidTime > validTime ||
      (existingCheckedTime === checkedTime && existingValidTime === validTime)
    ) {
      throw new OutOfDateError("Newer availability has already been recorded");
    } else if (existingValidTime === validTime) {
      updateData = { checked_at };
    } else {
      // At this point, there's new data or at least valid_at is new, so we
      // should only update if `valid_at` is newer than existing data.
      updateQuery = updateQuery.andWhere("valid_at", "<", valid_at);
      updateData = { checked_at, valid_at };

      const isChanged =
        existingAvailability.available !== available ||
        existingAvailability.available_count != available_count ||
        !isDeepStrictEqual(existingAvailability.products, products) ||
        !isDeepStrictEqual(existingAvailability.doses, doses) ||
        !isDeepStrictEqual(existingAvailability.capacity, capacity) ||
        !isDeepStrictEqual(existingAvailability.slots, slots) ||
        !isDeepStrictEqual(existingAvailability.meta, meta);

      // If there were changes, we need to set the changed_at time and save all
      // the new data. Otherwise, be nice to the DB by only sending updated
      // timestamps (full slot data can be as much as 500 kB!).
      if (isChanged) {
        changed_at = valid_at;
        updateData = {
          ...updateData,
          changed_at,
          available,
          available_count,
          products,
          doses,
          // Knex typings can't handle a complex type for the array contents. :(
          capacity: capacity as Array<any>,
          slots: slots as Array<any>,
          meta,
          is_public,
        };
      }
    }

    loggableUpdate = { source, ...updateData };
    const rowCount = await updateQuery.update(updateData);

    // It's possible the DB was updated between our original query and the
    // update query, in which case we were ultimately out-of-date.
    if (rowCount === 0) {
      throw new OutOfDateError("Newer availability has already been recorded");
    }

    result = { locationId: id, action: "update" };
  } else {
    try {
      await db("availability").insert({
        location_id: id,
        source,
        available,
        available_count,
        products,
        doses,
        capacity,
        slots,
        valid_at,
        checked_at,
        meta,
        is_public,
        changed_at: valid_at,
      });
      result = { locationId: id, action: "create" };
    } catch (error) {
      if (error.message.includes("availability_location_id_fkey")) {
        throw new NotFoundError(`Could not find location ${id}`);
      }
      throw error;
    }
  }

  // Write a log of this update, but don't wait for the result.
  availabilityLog
    .write(id, { ...loggableUpdate, changed_at })
    .catch((error) => {
      logStackTrace(logger, error);
      Sentry.captureException(error);
    });

  return result;
}

export async function listAvailability({
  includePrivate = false,
} = {}): Promise<LocationAvailability[]> {
  const fields = [
    "location_id",
    "source",
    "available",
    "valid_at",
    "checked_at",
    "meta",
  ];
  let where = "";

  if (includePrivate) {
    fields.push("is_public");
  } else {
    where = "is_public = true";
  }

  const result = await db.raw(`
    SELECT ${fields.join(", ")}
    FROM availability
    ${where ? `WHERE ${where}` : ""}
    ORDER BY valid_at DESC
  `);
  return result.rows;
}

export async function getAvailabilityForLocation(
  locationId: string,
  { includePrivate = false } = {}
): Promise<LocationAvailability[]> {
  const fields = [
    "location_id",
    "source",
    "available",
    "valid_at",
    "checked_at",
    "meta",
  ];
  const where = ["location_id = ?"];

  if (includePrivate) {
    fields.push("is_public");
  } else {
    where.push("is_public = true");
  }

  const result = await db.raw(
    `SELECT ${fields.join(", ")}
    FROM availability
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY valid_at DESC`,
    [locationId]
  );
  return result.rows;
}
