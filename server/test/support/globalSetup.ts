import * as Sentry from "@sentry/node";
import { knex } from "knex";
import { loadDbConfig } from "../../src/config";
import { clearDatabase } from "./database-core";

module.exports = async () => {
  Sentry.init({ enabled: false });

  const testDb = knex(loadDbConfig());
  await clearDatabase(testDb);
  await testDb.destroy();
};
