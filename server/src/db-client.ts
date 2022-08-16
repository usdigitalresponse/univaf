import Knex from "knex";
import type { Knex as KnexType } from "knex";
import * as Sentry from "@sentry/node";
import { logger } from "./logger";
import { getHostInstance, loadDbConfig } from "./config";
import { dogstatsd } from "./datadog";

export function createDbClient(label: string): KnexType<any, unknown[]> {
  const client = Knex(loadDbConfig(label));

  // Add debug-related logging.
  const pool = (client.client as KnexType.Client).pool;
  const instanceName = getHostInstance();
  const poolStatName = `db.${label.toLowerCase()}.pool`;

  function logPoolSize() {
    const poolSize = pool.numUsed() + pool.numFree();
    logger.debug(`${instanceName} ${label} DB pool size: ${poolSize}`);
    dogstatsd.gauge(`${poolStatName}.size`, poolSize);
  }
  pool.on("createSuccess", logPoolSize);
  pool.on("destroySuccess", logPoolSize);

  // Keep track of pending acquires (i.e. how backed up are we).
  function logPendingAcquires() {
    dogstatsd.gauge(
      `${poolStatName}.pending_acquires`,
      pool.numPendingAcquires()
    );
  }
  pool.on("acquireRequest", logPendingAcquires);
  pool.on("acquireSuccess", logPendingAcquires);
  pool.on("acquireFail", logPendingAcquires);

  // Keep track of how long acquiring a connection takes.
  const acquireTimes = new Map<number, number>();
  function logAcquireTime(eventId: number) {
    const startTime = acquireTimes.get(eventId);
    if (startTime) {
      acquireTimes.delete(eventId);
      dogstatsd.histogram(
        `${poolStatName}.acquire_time`,
        Date.now() - startTime
      );
    } else {
      logger.warn(
        `${instanceName} ${label} DB: no timing data for acquire ${eventId}`
      );
      Sentry.captureMessage(`No timing data for ${label} DB acquire`, {
        level: "warning",
      });
    }
  }
  pool.on("acquireRequest", (eventId) => acquireTimes.set(eventId, Date.now()));
  pool.on("acquireSuccess", logAcquireTime);
  pool.on("acquireFail", logAcquireTime);

  return client;
}
