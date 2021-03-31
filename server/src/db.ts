import {
  Availability,
  Position,
  ProviderLocation,
  LocationAvailability,
} from "./interfaces";
import { Pool } from "pg";

export const connection = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT && parseInt(process.env.DB_PORT),
});

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
  "eligibility",
  "description",
  "requires_waitlist",
  "meta",
  "created_at",
  "updated_at",
];

const providerLocationPrivateFields = [
  "external_ids",
  "is_public",
  "internal_notes",
];

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
  const now = new Date();
  const sqlData = {
    ...data,
    position: formatSqlPoint(data.position),
    created_at: now,
    updated_at: now,
  };
  const sqlFields = Object.entries(sqlData).filter(([key, _]) => {
    return providerLocationAllFields.includes(key);
  });

  await connection.query(
    `INSERT INTO provider_locations (
      ${sqlFields.map((x) => x[0]).join(", ")}
    )
    VALUES (${sqlFields.map((_, index) => `$${index + 1}`).join(", ")})`,
    sqlFields.map((x) => x[1])
  );
  return await getLocationById(data.id);
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
  const setExpression = sqlFields.map(
    ([key, _], index) => `${key} = $${index + 2}`
  );
  const result = await connection.query(
    `UPDATE provider_locations
    SET ${setExpression}
    WHERE id = $1`,
    [id, ...sqlFields.map((x) => x[1])]
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
  where = "",
  values = [] as any[],
} = {}): Promise<ProviderLocation[]> {
  let fields = providerLocationFields;

  if (includePrivate) {
    fields = fields.concat(providerLocationPrivateFields);
  } else {
    if (where) where += " AND ";
    where += `pl.is_public = true`;
  }

  // Reformat fields as select expressions to get the right data back.
  fields = fields
    .map((name) => `pl.${name}`)
    .map((name) => (name === "pl.position" ? selectSqlPoint(name) : name));

  const result = await connection.query(
    `
    SELECT ${fields.join(", ")}, row_to_json(availability.*) availability
    FROM provider_locations pl
      LEFT OUTER JOIN availability
        ON pl.id = availability.provider_location_id
        AND availability.updated_at = (
          SELECT MAX(updated_at)
          FROM availability avail_inner
          WHERE
            avail_inner.provider_location_id = pl.id
            ${!includePrivate ? `AND avail_inner.is_public = true` : ""}
        )
    ${where ? `WHERE ${where}` : ""}
    ORDER BY pl.updated_at DESC
    ${limit ? `LIMIT ${limit}` : ""}
  `,
    values || []
  );

  return result.rows.map((row) => {
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
    where: "pl.id = $1",
    values: [id],
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
    updated_at,
    checked_at,
    meta = null,
    is_public = true,
  }: {
    source: string;
    available: Availability;
    updated_at: Date;
    checked_at: Date;
    meta: any;
    is_public: boolean;
  }
): Promise<boolean> {
  if (!source) throw new TypeError("You must set `source`");
  if (!available) throw new TypeError("You must setprovide `available`");
  if (!checked_at) throw new TypeError("You must set `checked_at`");

  if (!updated_at) {
    updated_at = checked_at;
  }

  const existingAvailability = await connection.query(
    `SELECT id, provider_location_id, source
    FROM availability
    WHERE provider_location_id = $1 AND source = $2`,
    [id, source]
  );

  if (existingAvailability.rows.length > 0) {
    await connection.query(
      `
      UPDATE availability
      SET
        available = $1,
        updated_at = $2,
        checked_at = $3,
        meta = $4,
        is_public = $5
      WHERE id = $6
      `,
      [
        available,
        updated_at,
        checked_at,
        meta,
        is_public,
        existingAvailability.rows[0].id,
      ]
    );
    return true;
  } else {
    const location = await getLocationById(id);
    if (!location) {
      throw new Error("not found");
    }

    await connection.query(
      `INSERT INTO availability (
        provider_location_id,
        source,
        available,
        updated_at,
        checked_at,
        meta,
        is_public
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, source, available, updated_at, checked_at, meta, is_public]
    );
    return true;
  }
}

export async function listAvailability({
  includePrivate = false,
} = {}): Promise<LocationAvailability[]> {
  let fields = [
    "provider_location_id",
    "source",
    "available",
    "updated_at",
    "checked_at",
    "meta",
  ];
  let where = "";

  if (includePrivate) {
    fields.push("is_public");
  } else {
    where = "is_public = true";
  }

  const result = await connection.query(`
    SELECT ${fields.join(", ")}
    FROM availability
    ${where ? `WHERE ${where}` : ""}
    ORDER BY updated_at DESC
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
    "updated_at",
    "checked_at",
    "meta",
  ];
  let where = ["provider_location_id = $1"];

  if (includePrivate) {
    fields.push("is_public");
  } else {
    where.push("is_public = true");
  }

  const result = await connection.query(
    `SELECT ${fields.join(", ")}
    FROM availability
    ${where.length ? where.join(" AND ") : ""}
    ORDER BY updated_at DESC`,
    [locationId]
  );
  return result.rows;
}
