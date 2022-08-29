/**
 * Abstract tooling for working with the Postgres database. These could
 * conceivably live in `src/db-connection`, but we want to keep these separate
 * and isolated to tests.
 */

import type { Knex } from "knex";

// Don't clean out these tables; they aren't owned by the application.
const SYSTEM_TABLES = new Set([
  // From PostGIS.
  "spatial_ref_sys",
]);

const NON_DATA_TABLES = new Set([
  // Knex tables for tracking migrations, which the app shouldn't touch.
  "migrations",
  "migrations_lock",
]);

async function getApplicationTables(db: Knex): Promise<string[]> {
  const tableData = await db("pg_tables")
    .select("tablename")
    .where("schemaname", "=", "public");
  return tableData
    .map((row) => row.tablename)
    .filter((name) => !SYSTEM_TABLES.has(name));
}

export async function assertIsTestDatabase(db: Knex): Promise<void> {
  const result = await db.raw("SELECT current_database() as name;");
  const databaseName: string = result.rows[0].name;
  if (!databaseName.endsWith("-test")) {
    throw new Error(
      `Expected to be connected to the test database. Currently connected to ${databaseName}!`
    );
  }
}

/**
 * Clear all the data and restart sequences in a database.
 */
export async function clearData(db: Knex): Promise<void> {
  await assertIsTestDatabase(db);

  let tables = await getApplicationTables(db);
  tables = tables.filter((name) => !NON_DATA_TABLES.has(name));

  // Knex has a truncate() function, but it doesn't run on multiple tables.
  // Alternatively, if we go table by table, we need to use the CASCADE
  // keyword, which Knex does not support for truncation.
  // See: https://github.com/knex/knex/issues/1506
  await db.raw("TRUNCATE TABLE :tables: RESTART IDENTITY", { tables });
}

/**
 * Remove all the tables from a database and recreate the schema from scratch.
 */
export async function clearDatabase(db: Knex): Promise<void> {
  await assertIsTestDatabase(db);

  const tables = await getApplicationTables(db);
  await db.raw("DROP TABLE :tables: CASCADE", { tables });

  await db.migrate.latest();
}
