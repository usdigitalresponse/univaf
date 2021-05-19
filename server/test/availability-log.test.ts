import { installTestDatabaseHooks } from "./lib";
import { db, createLocation, updateAvailability } from "../src/db";
import { availabilityDb } from "../src/availability-log";

import { TestLocation } from "./fixtures";

installTestDatabaseHooks();

describe("availability_log", () => {
  it("schema should match availability schema", async () => {
    const cols = await db("availability").columnInfo();
    const logCols = await availabilityDb("availability_log").columnInfo();

    // @ts-ignore
    delete cols.id; // availability_log does not include id

    expect(cols).toEqual(logCols);
  });

  it("writes to the database", async () => {
    const location = await createLocation(TestLocation);
    await updateAvailability(location.id, TestLocation.availability);

    const written = await db("availability").select();
    expect(written.length).toEqual(1);

    const logWritten = await availabilityDb("availability_log").select();
    expect(logWritten.length).toEqual(1);
  });

  it("writes all updates to the database", async () => {
    const location = await createLocation(TestLocation);
    const latestAvailability = { ...TestLocation.availability };

    for (const hour of [1, 2, 3, 4, 5]) {
      latestAvailability.checked_at = new Date(2021, 5, 18, hour).toISOString();
      await updateAvailability(location.id, latestAvailability);
    }

    const written = await db("availability").select();
    expect(written.length).toEqual(1);

    const logWritten = await availabilityDb("availability_log").select();
    expect(logWritten.length).toEqual(5);
  });
});
