import { db } from "../../src/db";
import { availabilityDb } from "../../src/availability-log";

import type { Knex } from "knex";

// Don't clean out these tables before/after tests.
const DO_NOT_RESET_TABLES = new Set([
  // From PostGIS.
  "spatial_ref_sys",
  // Knex tables for tracking migrations, which the app shouldn't touch.
  "migrations",
  "migrations_lock",
]);

/**
 * Set up hooks to clear the content of tables and sequences between tests and
 * clean up database connections after tests. You should call this from any
 * module in which you are testing code that connects to the database.
 * @param extraConnections Additional database connections to install hooks for
 *        beyond the connections that are normally created by the app.
 *
 * @example
 * import { installDatabaseHooks } from "./support/database-testing"
 *
 * installTestDatabaseHooks();
 *
 * describe("A test suite", () => {
 *   it("should do something", () => {
 *     // ...your test code here...
 *   })
 * });
 */
export function installTestDatabaseHooks(...extraConnections: Knex[]): void {
  let conns: Knex[] = [db, availabilityDb, ...extraConnections];
  conns = [...new Set(conns)];

  afterAll(async () => {
    await allResolved(conns.map((c) => c.destroy()));
  });
  beforeEach(async () => {
    await resetDatabase();
  });
}

async function resetDatabase() {
  const tableData = await db("pg_tables")
    .select("tablename")
    .where("schemaname", "=", "public");
  const tables = tableData
    .map((row) => row.tablename)
    .filter((name) => !DO_NOT_RESET_TABLES.has(name));

  // Knex has a truncate() function, but it doesn't run on multiple tables.
  // Alternatively, if we go table by table, we need to use the CASCADE
  // keyword, which Knex does not support for truncation.
  // See: https://github.com/knex/knex/issues/1506
  await db.raw("TRUNCATE TABLE :tables: RESTART IDENTITY", { tables });
}

/**
 * Wait for all promises to settle, then reject afterward if at least one
 * of them rejected.
 *
 * This is similar to `Promise.all`, but it does not reject immediately. It is
 * also like `Promise.allSettled`, but that function never rejects.
 */
function allResolved(promises: Promise<void>[]): Promise<void> {
  return Promise.allSettled(promises).then(
    (results: Array<PromiseFulfilledResult<void> | PromiseRejectedResult>) => {
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
      }
    }
  );
}
