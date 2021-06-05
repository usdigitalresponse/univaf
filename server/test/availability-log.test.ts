import { installTestDatabaseHooks } from "./lib";
import { db, createLocation, updateAvailability } from "../src/db";
import { availabilityDb } from "../src/availability-log";
import { OutOfDateError } from "../src/exceptions";
import { Availability } from "../src/interfaces";
import { TestLocation } from "./fixtures";

installTestDatabaseHooks();

describe("availability_log", () => {
  it("schema should match availability schema", async () => {
    const cols = await db("availability").columnInfo();
    const logCols = await availabilityDb("availability_log").columnInfo();

    // @ts-ignore
    delete cols.id; // availability_log does not include id

    // Allow nullability to be different
    for (const definition of Object.values(cols)) {
      definition.nullable = true;
      definition.defaultValue = null;
    }
    for (const definition of Object.values(logCols)) {
      definition.nullable = true;
    }

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

  it("doesn't log if availability table was not updated", async () => {
    const location = await createLocation(TestLocation);
    // This should log.
    await updateAvailability(location.id, TestLocation.availability);

    // This should not log.
    await expect(async () => {
      await updateAvailability(location.id, TestLocation.availability);
    }).rejects.toThrow(OutOfDateError);

    const logWritten = await availabilityDb("availability_log").select();
    expect(logWritten.length).toEqual(1);
  });

  it("logs just `checked_at` when `valid_at` was not new", async () => {
    const location = await createLocation(TestLocation);
    const availability = { ...TestLocation.availability };
    await updateAvailability(location.id, availability);

    const checked_at = new Date();
    await updateAvailability(location.id, {
      ...availability,
      checked_at,
    });

    const logWritten = await availabilityDb("availability_log").select();
    expect(logWritten.length).toEqual(2);
    expect(logWritten[1]).toHaveProperty("location_id", location.id);
    expect(logWritten[1]).toHaveProperty("source", availability.source);
    expect(logWritten[1]).toHaveProperty("checked_at", checked_at);
    expect(logWritten[1]).toHaveProperty("valid_at", null);
    expect(logWritten[1]).toHaveProperty("available", null);
  });

  it("logs just `checked_at` and `valid_at` if data fields did not change", async () => {
    const location = await createLocation(TestLocation);
    const availability = { ...TestLocation.availability };
    await updateAvailability(location.id, availability);

    const checked_at = new Date();
    await updateAvailability(location.id, {
      ...availability,
      checked_at,
      valid_at: checked_at,
    });

    const logWritten = await availabilityDb("availability_log").select();
    expect(logWritten.length).toEqual(2);
    expect(logWritten[1]).toHaveProperty("location_id", location.id);
    expect(logWritten[1]).toHaveProperty("source", availability.source);
    expect(logWritten[1]).toHaveProperty("checked_at", checked_at);
    expect(logWritten[1]).toHaveProperty("valid_at", checked_at);
    expect(logWritten[1]).toHaveProperty("available", null);
    expect(logWritten[1]).toHaveProperty("available_count", null);
  });

  it("logs all fields if any data fields changed", async () => {
    const location = await createLocation(TestLocation);
    const availability = { ...TestLocation.availability };
    await updateAvailability(location.id, availability);

    const checked_at = new Date();
    await updateAvailability(location.id, {
      source: availability.source,
      checked_at,
      valid_at: checked_at,
      available: Availability.YES,
      available_count: 10,
      products: ["moderna", "pfizer"],
    });

    const logWritten = await availabilityDb("availability_log").select();
    expect(logWritten.length).toEqual(2);
    expect(logWritten[1]).toEqual({
      location_id: location.id,
      source: availability.source,
      checked_at,
      valid_at: checked_at,
      updated_at: expect.any(Date),
      available: Availability.YES,
      available_count: 10,
      products: ["moderna", "pfizer"],
      doses: null,
      capacity: null,
      slots: null,
      meta: null,
      is_public: true,
    });
  });
});
