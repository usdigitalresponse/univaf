import type { Knex } from "knex";
import { db, createLocation, updateAvailability } from "../../src/db";
import { availabilityDb } from "../../src/availability-log";
import { ProviderLocation } from "../../src/interfaces";
import { TestLocation } from "../fixtures";
import { allResolved } from "./lib";
import { clearData } from "./database-core";

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
    await clearData(db);
  });
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
