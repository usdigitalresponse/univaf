import { installTestDatabaseHooks } from "./lib";
import { createLocation, getLocationById, updateAvailability } from "../src/db";
import { Availability } from "../src/interfaces";
import { TestLocation } from "./fixtures";
import { ValueError, NotFoundError, OutOfDateError } from "../src/exceptions";

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
      meta: {},
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

  it("should accept detailed availability info", async () => {
    const location = await createLocation(TestLocation);
    const data = {
      source: "test-source",
      valid_at: "2021-05-14T06:45:51.273+00:00",
      checked_at: "2021-05-14T06:45:51.273+00:00",
      available: Availability.YES,
      available_count: 5,
      products: ["moderna", "pfizer"],
      doses: ["first_dose_only"],
      capacity: [
        {
          date: "2021-05-14",
          available: Availability.YES,
          available_count: 5,
          products: ["moderna", "pfizer"],
          dose: "first_dose_only",
        },
      ],
      slots: [
        {
          start: "2021-05-14T06:45:51.273+00:00",
          available: Availability.YES,
          products: ["moderna", "pfizer"],
          dose: "first_dose_only",
        },
      ],
    };
    await updateAvailability(location.id, { ...data });
    const { availability } = await getLocationById(location.id);
    expect(availability).toEqual(data);
  });

  it("should validate slot types", async () => {
    const location = await createLocation(TestLocation);

    await expect(async () => {
      await updateAvailability(location.id, {
        source: "test-source",
        checked_at: "2021-05-14T06:45:51.273+00:00",
        available: Availability.YES,
        slots: [
          // @ts-expect-error Allow  malformed data for testing
          {
            // Bad timestamp format
            start: "2021-05-14T06",
            products: ["moderna", "pfizer"],
            dose: "first_dose_only",
          },
        ],
      });
    }).rejects.toThrow(ValueError);

    await expect(async () => {
      await updateAvailability(location.id, {
        source: "test-source",
        checked_at: "2021-05-14T06:45:51.273+00:00",
        available: Availability.YES,
        slots: [
          {
            start: "2021-05-14T06:45:51.273+00:00",
            // @ts-expect-error Allow  malformed data for testing
            products: "moderna",
            dose: "first_dose_only",
          },
        ],
      });
    }).rejects.toThrow(ValueError);

    await expect(async () => {
      await updateAvailability(location.id, {
        source: "test-source",
        checked_at: "2021-05-14T06:45:51.273+00:00",
        available: Availability.YES,
        slots: [
          {
            start: "2021-05-14T06:45:51.273+00:00",
            // @ts-expect-error Allow  malformed data for testing
            available: "hello",
            products: ["moderna"],
            dose: "first_dose_only",
          },
        ],
      });
    }).rejects.toThrow(ValueError);
  });

  it("should validate capacity types", async () => {
    const location = await createLocation(TestLocation);

    await expect(async () => {
      await updateAvailability(location.id, {
        source: "test-source",
        checked_at: "2021-05-14T06:45:51.273+00:00",
        available: Availability.YES,
        capacity: [
          // @ts-expect-error Allow  malformed data for testing
          {
            // Bad date format
            date: "2021-05-14T06",
            products: ["moderna", "pfizer"],
            dose: "first_dose_only",
          },
        ],
      });
    }).rejects.toThrow(ValueError);

    await expect(async () => {
      await updateAvailability(location.id, {
        source: "test-source",
        checked_at: "2021-05-14T06:45:51.273+00:00",
        available: Availability.YES,
        capacity: [
          {
            date: "2021-05-14",
            // @ts-expect-error Allow  malformed data for testing
            products: "moderna",
            dose: "first_dose_only",
          },
        ],
      });
    }).rejects.toThrow(ValueError);

    await expect(async () => {
      await updateAvailability(location.id, {
        source: "test-source",
        checked_at: "2021-05-14T06:45:51.273+00:00",
        available: Availability.YES,
        capacity: [
          {
            date: "2021-05-14",
            // @ts-expect-error Allow  malformed data for testing
            available: "hello",
            products: ["moderna"],
            dose: "first_dose_only",
          },
        ],
      });
    }).rejects.toThrow(ValueError);

    await expect(async () => {
      await updateAvailability(location.id, {
        source: "test-source",
        checked_at: "2021-05-14T06:45:51.273+00:00",
        available: Availability.YES,
        capacity: [
          {
            date: "2021-05-14",
            available: Availability.YES,
            available_count: -1,
            products: ["moderna"],
            dose: "first_dose_only",
          },
        ],
      });
    }).rejects.toThrow(ValueError);
  });

  it("should fill in capacity from slots", async () => {
    const location = await createLocation(TestLocation);
    const data = {
      source: "test-source",
      checked_at: "2021-05-14T06:45:51.273+00:00",
      slots: [
        {
          start: "2021-05-14T06:45:51.273+00:00",
          available: Availability.YES,
          products: ["moderna", "pfizer"],
          dose: "first_dose_only",
        },
        {
          start: "2021-05-15T06:45:51.273+00:00",
          available: Availability.YES,
          products: ["moderna"],
          dose: "first_dose_only",
        },
        {
          start: "2021-05-15T07:45:51.273+00:00",
          available: Availability.YES,
          products: ["moderna"],
          dose: "first_dose_only",
        },
        {
          start: "2021-05-15T08:45:51.273+00:00",
          available: Availability.YES,
          products: ["pfizer"],
          dose: "first_dose_only",
        },
      ],
    };
    await updateAvailability(location.id, data);
    const { availability } = await getLocationById(location.id);
    expect(availability.capacity).toEqual([
      {
        date: "2021-05-14",
        available: Availability.YES,
        available_count: 1,
        unavailable_count: 0,
        products: ["moderna", "pfizer"],
        dose: "first_dose_only",
      },
      {
        date: "2021-05-15",
        available: Availability.YES,
        available_count: 2,
        unavailable_count: 0,
        products: ["moderna"],
        dose: "first_dose_only",
      },
      {
        date: "2021-05-15",
        available: Availability.YES,
        available_count: 1,
        unavailable_count: 0,
        products: ["pfizer"],
        dose: "first_dose_only",
      },
    ]);
  });

  it("should fill available, available_count, products, and doses from capacity", async () => {
    const location = await createLocation(TestLocation);
    await updateAvailability(location.id, {
      source: "test-source",
      checked_at: "2021-05-14T06:45:51.273+00:00",
      capacity: [
        {
          date: "2021-05-14",
          available: Availability.YES,
          available_count: 1,
          unavailable_count: 0,
          products: ["moderna", "pfizer"],
          dose: "first_dose_only",
        },
        {
          date: "2021-05-15",
          available: Availability.YES,
          available_count: 2,
          unavailable_count: 0,
          products: ["moderna"],
          dose: "first_dose_only",
        },
        {
          date: "2021-05-15",
          available: Availability.YES,
          available_count: 1,
          unavailable_count: 0,
          products: ["pfizer"],
          dose: "first_dose_only",
        },
      ],
    });

    const { availability } = await getLocationById(location.id);
    expect(availability).toHaveProperty("available", Availability.YES);
    expect(availability).toHaveProperty("available_count", 4);
    expect(availability).toHaveProperty("products", ["moderna", "pfizer"]);
    expect(availability).toHaveProperty("doses", ["first_dose_only"]);
  });

  it("should not fill in available_count if capacity doesn't have counts", async () => {
    const location = await createLocation(TestLocation);
    await updateAvailability(location.id, {
      source: "test-source",
      checked_at: "2021-05-14T06:45:51.273+00:00",
      capacity: [
        {
          date: "2021-05-14",
          available: Availability.NO,
        },
        {
          date: "2021-05-15",
          available: Availability.YES,
        },
        {
          date: "2021-05-15",
          available: Availability.YES,
        },
      ],
    });

    const { availability } = await getLocationById(location.id);
    expect(availability).not.toHaveProperty("available_count");
  });

  it("should fill in available from available_count", async () => {
    const location = await createLocation(TestLocation);

    await updateAvailability(location.id, {
      source: "test-source",
      checked_at: "2021-05-14T06:46:00Z",
      available_count: 5,
    });
    let result = await getLocationById(location.id);
    expect(result).toHaveProperty("availability.available", Availability.YES);

    await updateAvailability(location.id, {
      source: "test-source",
      checked_at: "2021-05-14T06:47:00Z",
      available_count: 0,
    });
    result = await getLocationById(location.id);
    expect(result).toHaveProperty("availability.available", Availability.NO);
  });
});
