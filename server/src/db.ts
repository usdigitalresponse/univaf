import {
  Availability,
  Position,
  ProviderLocation,
  LocationAvailability,
} from "./interfaces";
import { nanoid } from "nanoid";
import { Pool } from "pg";
import { NotFoundError, OutOfDateError, ValueError } from "./exceptions";
import Knex from "knex";

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

export async function closeDatabase() {
  await db.destroy();
}

export async function startTransaction() {
  await db.raw("BEGIN");
}

export async function rollbackTransaction() {
  await db.raw("ROLLBACK");
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

  // If an ID is not specified, generate a random one.
  let id = data.id;
  if (!id) {
    let unique = false;
    while (!unique) {
      id = nanoid();
      const result = await db.raw(
        `SELECT id FROM provider_locations WHERE id = ? LIMIT 1`,
        [id]
      );
      unique = !result.rows.length;
    }
  }

  const now = new Date();
  const sqlData: { string: string } = {
    ...data,
    id,
    position: formatSqlPoint(data.position),
    created_at: now,
    updated_at: now,
  };
  const sqlFields = Object.entries(sqlData).filter(([key, _]) => {
    return providerLocationAllFields.includes(key);
  });

  await db.raw(
    `INSERT INTO provider_locations (
      ${sqlFields.map((x) => x[0]).join(", ")}
    )
    VALUES (${sqlFields.map((_) => "?").join(", ")})`,
    sqlFields.map((x) => x[1] || null)
  );
  return await getLocationById(id);
}

/**
 * Update data about a provider location.
 * @param data ProviderLocation-like object with data to update
 */
export async function updateLocation(data: any): Promise<ProviderLocation> {
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
  const setExpression = sqlFields.map(([key, _]) => `${key} = ?`);
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

  const result = await db.raw(
    `
    SELECT ${fields.join(", ")}, row_to_json(availability.*) availability
    FROM provider_locations pl
      LEFT OUTER JOIN availability
        ON pl.id = availability.provider_location_id
        AND availability.valid_at = (
          SELECT MAX(valid_at)
          FROM availability avail_inner
          WHERE
            avail_inner.provider_location_id = pl.id
            ${!includePrivate ? `AND avail_inner.is_public = true` : ""}
        )
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY pl.updated_at DESC
    ${limit ? `LIMIT ${limit}` : ""}
    `,
    values || []
  );

  return result.rows.map((row: any) => {
    // The SELECT expression always creates an object; not sure if there's a
    // good way to get it to output `NULL` instead for this case.
    if (!row.position.longitude) row.position = null;

    if (row.availability) {
      delete row.availability.id;
      delete row.availability.provider_location_id;
      delete row.availability.is_public;
    }

    return row;
  });
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
    valid_at,
    checked_at,
    meta = null,
    is_public = true,
  }: {
    source: string;
    available: Availability;
    valid_at: Date;
    checked_at: Date;
    meta: any;
    is_public: boolean;
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
    `SELECT id, provider_location_id, source
    FROM availability
    WHERE provider_location_id = ? AND source = ?`,
    [id, source]
  );

  if (existingAvailability.rows.length > 0) {
    const result = await db.raw(
      `
      UPDATE availability
      SET
        available = :available,
        valid_at = :valid_at,
        checked_at = :checked_at,
        meta = :meta,
        is_public = :is_public
      WHERE id = :id AND checked_at < :valid_at
      `,
      {
        available,
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
      const result = await db.raw(
        `INSERT INTO availability (
          provider_location_id,
          source,
          available,
          valid_at,
          checked_at,
          meta,
          is_public
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, source, available, valid_at, checked_at, meta, is_public]
      );
      return { locationId: id, action: "create" };
    } catch (error) {
      if (error.message.includes('constraint "fk_provider_location"')) {
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
    "provider_location_id",
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
    "provider_location_id",
    "source",
    "available",
    "valid_at",
    "checked_at",
    "meta",
  ];
  let where = ["provider_location_id = ?"];

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
