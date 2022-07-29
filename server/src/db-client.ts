import Knex from "knex";
import type { Knex as KnexType } from "knex";
import { logger } from "./logger";
import { getHostInstance, loadDbConfig } from "./config";

export function createDbClient(label: string): KnexType<any, unknown[]> {
  const client = Knex(loadDbConfig());

  // Add debug-related logging.
  const pool = (client.client as KnexType.Client).pool;
  const instanceName = getHostInstance();
  function logPoolSize() {
    const poolSize = pool.numUsed() + pool.numFree();
    logger.info(`${instanceName} ${label} DB pool size: ${poolSize}`);
  }
  pool.on("createSuccess", logPoolSize);
  pool.on("destroySuccess", logPoolSize);

  return client;
}
