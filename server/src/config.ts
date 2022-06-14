import type { Knex } from "knex";

export const LOG_LEVEL = process.env.LOG_LEVEL || "info";

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

export function loadDbConfig(): Knex.Config {
  const knexfile = require("../knexfile");
  const nodeEnv = process.env.NODE_ENV || "development";
  return knexfile[nodeEnv];
}
