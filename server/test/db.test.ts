import { installTestDatabaseHooks } from "./lib";
import { createLocation, getLocationById, updateAvailability } from "../src/db";
import { Availability } from "../src/interfaces";
import { TestLocation } from "./fixtures";
import { OutOfDateError } from "../src/exceptions";
import { NotFoundError } from "../src/exceptions";

installTestDatabaseHooks();

describe("db.updateAvailability", () => {
  it("should update a location's availability", async () => {
    const location = await createLocation(TestLocation);
    let freshLocation = await getLocationById(location.id);
    expect(freshLocation.availability).toBe(null);

    const result = await updateAvailability(
      location.id,
      TestLocation.availability
    );
    expect(result).toEqual({ locationId: location.id, action: "create" });

    const { availability } = await getLocationById(location.id);
    availability.valid_at = new Date(availability.valid_at);
    availability.checked_at = new Date(availability.checked_at);
    expect(availability).toEqual({
      available: "YES",
      source: "NJVSS Export",
      valid_at: new Date(TestLocation.availability.valid_at),
      checked_at: new Date(TestLocation.availability.checked_at),
    });
  });

  it("should throw on updates non-existent locations", async () => {
    await expect(async () => {
      await updateAvailability(TestLocation.id, TestLocation.availability);
    }).rejects.toThrow(NotFoundError);
  });

  it("should update a an existing record for the same location and source", async () => {
    const location = await createLocation(TestLocation);
    await updateAvailability(location.id, TestLocation.availability);

    const newData = {
      ...TestLocation.availability,
      checked_at: new Date(),
    };
    const result = await updateAvailability(location.id, newData);
    expect(result).toEqual({ locationId: location.id, action: "update" });
  });

  it("should throw on updates that aren't newer than existing data", async () => {
    const location = await createLocation(TestLocation);
    await updateAvailability(location.id, TestLocation.availability);
    await expect(async () => {
      await updateAvailability(location.id, TestLocation.availability);
    }).rejects.toThrow(OutOfDateError);
  });

  it("should fill in valid_at from checked_at", async () => {
    const location = await createLocation(TestLocation);
    const time = "2021-05-14T06:45:51.273+00:00";
    await updateAvailability(location.id, {
      source: "test-source",
      checked_at: time,
      available: Availability.YES,
    });
    const { availability } = await getLocationById(location.id);
    expect(availability).toHaveProperty("valid_at", time);
  });

  it.skip("should accept detailed availability info", async () => {
    throw new Error("Not implemented");
  });

  it.skip("should ensure basic types", async () => {
    throw new Error("Not implemented");
  });

  it.skip("should validate slot types", async () => {
    throw new Error("Not implemented");
  });

  it.skip("should validate capacity types", async () => {
    throw new Error("Not implemented");
  });

  it.skip("should fill in capacity from slots", async () => {
    throw new Error("Not implemented");
  });

  it.skip("should fill availability, availability_count, products, and doses from capacity", async () => {
    throw new Error("Not implemented");
  });

  it.skip("should fill in availability from availability_count", async () => {
    throw new Error("Not implemented");
  });
});
