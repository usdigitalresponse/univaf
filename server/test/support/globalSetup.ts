import { knex } from "knex";
import { loadDbConfig } from "../../src/config";

export const testDb = knex(loadDbConfig());

module.exports = async () => {
  await clearTestDatabase();
  await testDb.destroy();
};

export function assertIsTestDatabase(): Promise<void> {
  return testDb.raw("SELECT current_database() as name;").then((result) => {
    const databaseName: string = result.rows[0].name;
    if (!databaseName.endsWith("-test")) {
      throw new Error(
        `Expected to be connected to the test database. Currently connected to ${databaseName}!`
      );
    }
  });
}

export async function clearTestDatabase(): Promise<void> {
  await assertIsTestDatabase();

  const res = await testDb.raw(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public'"
  );

  await Promise.all(
    res.rows.map(async (row: any) => {
      if (row.tablename != "spatial_ref_sys") {
        return testDb.raw(`DROP TABLE ${row.tablename} CASCADE`);
      }
    })
  );

  await testDb.migrate.latest();
}
