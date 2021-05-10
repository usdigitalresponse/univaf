import { useServerForTests, installTestDatabaseHooks } from "./lib";
import { getApiKeys } from "../src/config";
import app from "../src/app";

import { createLocation, getLocationById, updateAvailability } from "../src/db";

import { Availability } from "../src/interfaces";

installTestDatabaseHooks();

describe("GET /locations", () => {
  const context = useServerForTests(app);

  it("responds with a list of locations", async () => {
    const location = await createLocation(TestLocation);
    await updateAvailability(location.id, TestLocation.availability);
    const res = await context.client.get("locations");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("responds with a list of locations filtered by state", async () => {
    const location = await createLocation(TestLocation);
    await updateAvailability(location.id, TestLocation.availability);

    let res = await context.client.get("locations?state=AK");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(0);

    res = await context.client.get("locations?state=NJ");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("responds with a list of locations filtered by provider", async () => {
    const location = await createLocation(TestLocation);
    await updateAvailability(location.id, TestLocation.availability);

    let res = await context.client.get("locations?provider=MISSING");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(0);

    res = await context.client.get("locations?provider=NJVSS");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("GET /locations/:id", () => {
  const context = useServerForTests(app);

  it("responds with location status", async () => {
    const location = await createLocation(TestLocation);
    await updateAvailability(location.id, TestLocation.availability);

    const res = await context.client.get(`locations/${location.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("id", location.id);
    expect(res.body).toHaveProperty("name", TestLocation.name);
    expect(res.body).toHaveProperty(
      "location_type",
      TestLocation.location_type
    );
  });
});

describe("POST /update", () => {
  const context = useServerForTests(app);

  const headers = {
    Accept: "application/json",
    "x-api-key": getApiKeys()[0],
  };

  it("updates location metadata successfully", async () => {
    const location = await createLocation(TestLocation);
    const newName = "New Name";

    let res = await context.client.post("update?update_location=1", {
      headers,
      json: {
        id: location.id,
        name: newName,
      },
    });
    expect(res.statusCode).toBe(200);

    res = await context.client.get(`locations/${location.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("id", location.id);
    expect(res.body).toHaveProperty("name", newName);
  });

  it("updates availability successfully", async () => {
    const location = await createLocation(TestLocation);

    let res = await context.client.post("update", {
      headers,
      json: {
        id: location.id,
        availability: {
          source: "NJVSS Export",
          available: "NO",
          checked_at: new Date(),
        },
      },
    });
    expect(res.statusCode).toBe(200);

    res = await context.client.get(`locations/${location.id}`);
    expect(res.statusCode).toBe(200);

    expect(res.body).toHaveProperty("id", location.id);
    expect(res.body).toHaveProperty("availability.available", "NO");

    res = await context.client.post("update", {
      headers,
      json: {
        id: location.id,
        availability: {
          source: "NJVSS Export",
          available: "UNKNOWN",
          checked_at: new Date(),
        },
      },
    });
    expect(res.statusCode).toBe(200);

    res = await context.client.get(`locations/${location.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("id", location.id);
    expect(res.body).toHaveProperty("availability.available", "UNKNOWN");
  });

  it("updates location metadata based on `external_ids` if location matching `id` does not exist", async () => {
    const location = await createLocation(TestLocation);
    const newName = "New Name";
    const externalId = Object.entries(TestLocation.external_ids)[0];

    const res = await context.client.post("update?update_location=1", {
      headers,
      json: {
        id: "abc123",
        external_ids: {
          [externalId[0]]: externalId[1],
        },
        name: newName,
      },
    });
    expect(res.statusCode).toBe(200);

    const result = await getLocationById(location.id);
    expect(result).toHaveProperty("name", newName);
  });

  it("updates location metadata based on `external_ids` if `id` is not in update data", async () => {
    const location = await createLocation(TestLocation);
    const newName = "New Name";
    const externalId = Object.entries(TestLocation.external_ids)[0];

    const res = await context.client.post("update?update_location=1", {
      headers,
      json: {
        external_ids: {
          [externalId[0]]: externalId[1],
        },
        name: newName,
      },
    });
    expect(res.statusCode).toBe(200);

    const result = await getLocationById(location.id);
    expect(result).toHaveProperty("name", newName);
  });

  it("should not update based on vtrcks PINs", async () => {
    await createLocation(TestLocation);
    const newName = "New Name";

    const res = await context.client.post("update?update_location=1", {
      headers,
      json: {
        external_ids: {
          vtrcks: TestLocation.external_ids.vtrcks,
        },
        name: newName,
      },
    });
    expect(res.statusCode).toBe(201);
  });
});

const TestLocation = {
  id: "47c59c23cbd4672173cc93b8a39b60ddf481dd56",
  external_ids: {
    njiis: "nj1234",
    vtrcks: "456",
  },
  provider: "NJVSS",
  location_type: "mass_vax",
  name: "Gloucester County Megasite",
  address_lines: [
    "Rowan College of South Jersey",
    "1400 Tanyard Road",
    "Sewell",
  ],
  state: "NJ",
  county: "Gloucester",
  booking_phone: "",
  booking_url: "https://covidvaccine.nj.gov/",
  description: "This location is available for 1st and 2nd dose recipients.",
  requires_waitlist: true,
  is_public: true,
  availability: {
    source: "NJVSS Export",
    checked_at: new Date(),
    valid_at: new Date(),
    available: Availability.YES,
    is_public: true,
    meta: {},
  },
  meta: {},
};
