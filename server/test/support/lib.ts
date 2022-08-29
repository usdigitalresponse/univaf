import type { AddressInfo } from "net";
import type { Application } from "express";
import type { Server } from "http";
import got, { Got } from "got";

import { db, createLocation, updateAvailability } from "../../src/db";
import { availabilityDb } from "../../src/availability-log";
import { ProviderLocation } from "../../src/interfaces";
import { TestLocation } from "../fixtures";

import type { Knex } from "knex";

// Don't clean out these tables before/after tests.
const DO_NOT_RESET_TABLES = new Set([
  // From PostGIS.
  "spatial_ref_sys",
  // Knex tables for tracking migrations, which the app shouldn't touch.
  "migrations",
  "migrations_lock",
]);

interface Context {
  server?: Server;
  client?: Got;
}

export function useServerForTests(app: Application): Context {
  const context: Context = {};

  beforeEach((done) => {
    context.server = app.listen(0, () => {
      const { port } = context.server.address() as AddressInfo;
      app.set("port", port);
      context.client = got.extend({
        prefixUrl: `http://127.0.0.1:${port}`,
        responseType: "json",
        throwHttpErrors: false,
      });
      done();
    });
  });

  afterEach((done) => {
    if (context.server) {
      context.server.close((error?: Error) => {
        // Jest needs a tick after server shutdown to detect
        // that the resources have been released.
        setTimeout(() => done(error), 10);
      });
    } else {
      done();
    }
  });

  return context;
}

export function installTestDatabaseHooks(...extraConnections: Knex[]): void {
  // Wait for all promises to settle, but reject afterward if at
  // least one of them rejected.
  function allResolved(promises: Promise<void>[]) {
    return Promise.allSettled(promises).then(
      (
        results: Array<PromiseFulfilledResult<void> | PromiseRejectedResult>
      ) => {
        for (const result of results) {
          if (result.status === "rejected") throw result.reason;
        }
      }
    );
  }

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
 * Create a new provider with random identifiers.
 * @param customizations Any specific values that should be set on the location.
 *        If the `availability` property is set, an availability record will
 *        also be created for the location (the value for `availability` only
 *        needs to have the values you want to customize, acceptable values for
 *        unspecified but required properties will be created for you).
 * @returns {ProviderLocation}
 */
export async function createRandomLocation(
  customizations: any
): Promise<ProviderLocation> {
  const location = await createLocation({
    ...TestLocation,
    id: null,
    external_ids: [["test_id", Math.random().toString()]],
    ...customizations,
  });

  if (customizations.availability) {
    await updateAvailability(location.id, {
      ...TestLocation.availability,
      ...customizations.availability,
    });
  }

  return location;
}

/**
 * Declare that a value should be a complete W3C-style ISO 8601 datetime
 * string. (e.g. "2021-03-13T05:53:20.123Z")
 *
 * @example
 * const value = { time: "2021-03-13T05:53:20.123Z" };
 * expect(value).toEqual({ time: expectDatetimeString() })
 */
export function expectDatetimeString(): any {
  return expect.stringMatching(
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(.\d+)?(Z|[+-]\d\d:?\d\d)$/
  );
}

/**
 * Parse an ND-JSON (newline-delimited JSON) string in to an array of objects.
 * @param rawData the ND-JSON string to parse.
 */
export function ndjsonParse(rawData: string): any[] {
  return rawData
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
