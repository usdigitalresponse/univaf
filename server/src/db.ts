import {
  Availability,
  Position,
  ProviderLocation,
  LocationAvailability,
  CapacityRecord,
  SlotRecord,
} from "./interfaces";
import { nanoid } from "nanoid";
import { Pool } from "pg";
import { NotFoundError, OutOfDateError, ValueError } from "./exceptions";
import Knex from "knex";

const DEFAULT_BATCH_SIZE = 2000;

export const db = Knex(loadDbConfig());

export function assertIsTestDatabase() {
  let error = false;
  return db.raw("SELECT current_database() as name;").then((result) => {
    const databaseName: string = result.rows[0].name;
    if (!databaseName.endsWith("-test")) {
      throw new Error(
        `Expected to be connected to the test database. Currently connected to ${databaseName}!`
      );
    }
  });
}

export async function clearTestDatabase() {
  await assertIsTestDatabase();

  const res = await db.raw(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public'"
  );

  await Promise.all(
    res.rows.map(async (row: any) => {
      if (row.tablename != "spatial_ref_sys") {
        return db.raw(`DROP TABLE ${row.tablename} CASCADE`);
      }
    })
  );

  await db.migrate.latest();
}

function loadDbConfig() {
  const knexfile = require("../knexfile");
  const nodeEnv = process.env.NODE_ENV || "development";
  return knexfile[nodeEnv];
}

const providerLocationFields = [
  "id",
  "external_ids",
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
  "eligibility",
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
    json_build_object(
      'longitude', st_x(${column}::geometry),
      'latitude', st_y(${column}::geometry)
    ) as position
  `.trim();
}

/**
 * Create a provider location.
 * @param data ProviderLocation-like object with data to insert
 */
export async function createLocation(data: any): Promise<ProviderLocation> {
  if (!data.name) throw new ValueError("Locations must have a `name`");

  const now = new Date();
  const sqlData: { [index: string]: string } = {
    ...data,
    position: formatSqlPoint(data.position),
    created_at: now,
    updated_at: now,
  };
  delete sqlData.id;
  const sqlFields = Object.entries(sqlData).filter(([key, _]) => {
    return providerLocationAllFields.includes(key);
  });

  const inserted = await db.raw(
    `INSERT INTO provider_locations (
      ${sqlFields.map((x) => x[0]).join(", ")}
    )
    VALUES (${sqlFields.map((_) => "?").join(", ")})
    RETURNING id`,
    sqlFields.map((x) => x[1] || null)
  );
  return await getLocationById(inserted.rows[0].id);
}

/**
 * Update data about a provider location.
 * @param data ProviderLocation-like object with data to update
 */
export async function updateLocation(
  data: any,
  { mergeSubfields = true } = {}
): Promise<ProviderLocation> {
  const id = data.id;
  if (!data.id) throw new Error("Location must have an ID to update");

  const now = new Date();
  const sqlData = {
    ...data,
    updated_at: now,
  };
  if ("position" in sqlData) {
    sqlData.position = formatSqlPoint(sqlData.position);
  }

  const sqlFields = Object.entries(sqlData).filter(([key, _]) => {
    return providerLocationAllFields.includes(key);
  });
  const setExpression = sqlFields.map(([key, _]) => {
    // Merge external_ids and meta, rather than replacing.
    if (mergeSubfields && (key === "external_ids" || key === "meta")) {
      return `${key} = ${key} || ?`;
    }
    return `${key} = ?`;
  });
  const result = await db.raw(
    `UPDATE provider_locations
    SET ${setExpression}
    WHERE id = ?`,
    [...sqlFields.map((x) => x[1]), id]
  );
  return result.rows[0];
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
      WITH latest_availability AS (
        SELECT
        rank() OVER ( PARTITION BY location_id ORDER BY valid_at DESC ),
        *
        FROM availability
        ${!includePrivate ? `WHERE availability.is_public = true` : ""}
      )
      SELECT
        ${fields.join(", ")},
        json_strip_nulls(row_to_json(latest_availability.*)) availability
      FROM provider_locations pl
        LEFT OUTER JOIN latest_availability
          ON pl.id = latest_availability.location_id
          AND latest_availability.rank < 2
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

  return result.rows.map((row: any) => {
    // The SELECT expression always creates an object; not sure if there's a
    // good way to get it to output `NULL` instead for this case.
    if (!row.position.longitude) row.position = null;

    if (row.availability) {
      delete row.availability.id;
      delete row.availability.location_id;
      delete row.availability.is_public;
      delete row.availability.rank;
    }

    return row;
  });
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
} = {}) {
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
    if (limit) batchSize = Math.min(batchSize, limit - total);
    if (nextValues) {
      batchWhere = where.concat(["(created_at, id) > (?, ?)"]);
      batchValues = values.concat(nextValues);
    }

    const batch: Array<ProviderLocation> = await listLocations({
      includePrivate,
      where: batchWhere,
      values: batchValues,
      limit: batchSize,
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

    // Stop if there is no more data.
    if (!nextValues) break;
  }
}

/**
 * Returns a single provider location based upon its id (or undefined).
 * @param id
 * @returns ProviderLocation | undefined
 */
export async function getLocationById(
  id: string,
  { includePrivate = false } = {}
): Promise<ProviderLocation | undefined> {
  const rows = await listLocations({
    includePrivate,
    limit: 1,
    where: ["pl.id = ?"],
    values: [id],
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
  externalIds: { string: string },
  { includePrivate = false } = {}
): Promise<ProviderLocation | undefined> {
  const wheres = [];
  const ids = [];
  for (const [idSystem, idValue] of Object.entries(externalIds)) {
    // VTrckS PINs are not unique for this use-case, and so should not be
    // queried here. It's a quirk of history and past misunderstanding that we
    // have them in `external_ids`.
    if (idSystem === "vtrcks") continue;

    wheres.push("pl.external_ids @> ?");
    ids.push({ [idSystem]: idValue });
  }

  // Bail out early if there was nothing to actually query on.
  if (!ids.length) return null;

  const rows = await listLocations({
    includePrivate,
    limit: 1,
    where: [`( ${wheres.join(" OR ")} )`],
    values: ids,
  });
  return rows[0];
}

/**
 * Updates a given location's availability based upon its id
 * @param id
 * @param availability
 * @returns
 */
export async function updateAvailability(
  id: string,
  {
    source,
    available,
    checked_at,
    valid_at = null,
    available_count = null,
    products = null,
    doses = null,
    capacity = null,
    slots = null,
    meta = null,
    is_public = true,
  }: {
    source: string;
    available: Availability;
    checked_at: Date | string;
    valid_at?: Date | string;
    available_count?: number;
    products?: Array<string>;
    doses?: Array<string>;
    capacity?: Array<CapacityRecord>;
    slots?: Array<SlotRecord>;
    meta?: any;
    is_public?: boolean;
  }
): Promise<{ action: string; locationId: string }> {
  if (!source) throw new ValueError("You must set `source`");
  if (!available) throw new ValueError("You must set `available`");
  if (!checked_at) throw new ValueError("You must set `checked_at`");

  if (!valid_at) {
    valid_at = checked_at;
  }

  // FIXME: Do everything here in one PG call with INSERT ... ON CONFLICT ...
  // or wrap this in a PG advisory lock to keep consistent across calls.
  const existingAvailability = await db.raw(
    `SELECT id, location_id, source
    FROM availability
    WHERE location_id = ? AND source = ?`,
    [id, source]
  );

  if (existingAvailability.rows.length > 0) {
    const result = await db.raw(
      `
      UPDATE availability
      SET
        available = :available,
        available_count = :available_count,
        products = :products,
        doses = :doses,
        capacity = :capacity,
        slots = :slots,
        valid_at = :valid_at,
        checked_at = :checked_at,
        meta = :meta,
        is_public = :is_public
      WHERE id = :id AND checked_at < :checked_at
      `,
      {
        available,
        available_count,
        products,
        doses,
        // Knex typings can't handle a complex type for the array contents. :(
        capacity: capacity as Array<any>,
        slots: slots as Array<any>,
        valid_at,
        checked_at,
        meta,
        is_public,
        id: existingAvailability.rows[0].id,
      }
    );

    if (result.rowCount === 0) {
      throw new OutOfDateError(
        "Newer availability data has already been recorded"
      );
    } else {
      return { locationId: id, action: "update" };
    }
  } else {
    try {
      await db.raw(
        `INSERT INTO availability (
          location_id,
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
          is_public
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
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
        ]
      );
      return { locationId: id, action: "create" };
    } catch (error) {
      if (error.message.includes("availability_location_id_fkey")) {
        console.error(`SQL Error: ${error.message}`);
        throw new NotFoundError(`Could not find location ${id}`);
      }
      throw error;
    }
  }
}

export async function listAvailability({
  includePrivate = false,
} = {}): Promise<LocationAvailability[]> {
  let fields = [
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
  let fields = [
    "location_id",
    "source",
    "available",
    "valid_at",
    "checked_at",
    "meta",
  ];
  let where = ["location_id = ?"];

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
