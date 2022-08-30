import { knex } from "knex";
import { loadDbConfig } from "../../src/config";
import { clearDatabase } from "./database-core";

module.exports = async () => {
  const testDb = knex(loadDbConfig());
  await clearDatabase(testDb);
  await testDb.destroy();
};
