import os from "node:os";
import type { Knex } from "knex";

export const LOG_LEVEL = process.env.LOG_LEVEL || "info";

// TODO: share the logic for getting the release/version with the loader.
export const RELEASE =
  process.env.RELEASE || process.env.RENDER_GIT_COMMIT || undefined;

export function getApiKeys(): Array<string> {
  let keyList = process.env.API_KEYS;
  if (!keyList) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "You must set API_KEYS to a comma-separated list of keys in production"
      );
    } else {
      keyList = "dev-key";
    }
  }

  return keyList.split(",").map((key) => key.trim());
}

/**
 * Get the configured host (e.g. `getmyvax.org`) for the app from the
 * PRIMARY_HOST environment variable.
 * Note this is a host, not a host *name*, so it may include a port.
 * @returns {string?}
 */
export function getPrimaryHost(): string {
  const host = process.env.PRIMARY_HOST;
  if (host && !/^[a-zA-Z][a-zA-Z0-9.-]*[a-zA-Z0-9](:\d+)?$/.test(host)) {
    throw new TypeError(
      `The PRIMARY_HOST environment variable ("${host}") is not a valid host`
    );
  }
  return host || null;
}

export function getPlatform(): string {
  if (process.env.RENDER) {
    return "render";
  } else if (
    process.env.ECS_CONTAINER_METADATA_URI ||
    process.env.ECS_CONTAINER_METADATA_URI_V4
  ) {
    return "ecs";
  } else {
    return "";
  }
}

/**
 * Get a string identifier for host machine instance the app is running on.
 * @returns {string}
 */
export function getHostInstance(): string {
  if (process.env.RENDER) {
    return `${process.env.RENDER_SERVICE_NAME}-${process.env.RENDER_INSTANCE_ID}`;
  } else {
    return os.hostname();
  }
}

function getPoolSize(connectionName?: string): number {
  if (!connectionName) return 0;

  const sizeName = `DB_POOL_SIZE_${connectionName.toUpperCase()}`;
  const rawSize = process.env[sizeName];
  if (!rawSize) return 0;

  const size = parseInt(rawSize, 10);
  if (isNaN(size) || size < 0) {
    throw new TypeError(`${sizeName} must be >= 0 (not "${rawSize}")`);
  }
  return size;
}

export function loadDbConfig(connectionName?: string): Knex.Config {
  const knexfile = require("../knexfile");
  const nodeEnv = process.env.NODE_ENV || "development";
  const poolSize = getPoolSize(connectionName);
  return {
    ...knexfile[nodeEnv],
    pool: {
      ...knexfile[nodeEnv].pool,
      max: poolSize || knexfile[nodeEnv].pool.max,
    },
  };
}
