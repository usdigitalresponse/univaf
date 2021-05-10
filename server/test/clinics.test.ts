import { testClient } from "./lib";
import { getApiKeys } from "../src/config";
import app from "../src/app";

import {
  clearTestDatabase,
  closeDatabase,
  startTransaction,
  rollbackTransaction,
  createLocation,
  updateAvailability,
} from "../src/db";

import { Availability } from "../src/interfaces";

beforeAll(clearTestDatabase);
afterAll(closeDatabase);

beforeEach(startTransaction);
afterEach(rollbackTransaction);

describe("GET /locations", () => {
  it("responds with a list of locations", async () => {
    await createLocation(TestLocation);
    await updateAvailability(TestLocation.id, TestLocation.availability);
    const res = await testClient(app).get("locations");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("GET /locations/:id", () => {
  it("responds with location status", async () => {
    await createLocation(TestLocation);
    await updateAvailability(TestLocation.id, TestLocation.availability);

    const res = await testClient(app).get(`locations/${TestLocation.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("id", TestLocation.id);
    expect(res.body).toHaveProperty("name", TestLocation.name);
    expect(res.body).toHaveProperty(
      "location_type",
      TestLocation.location_type
    );
  });
});

describe("POST /update", () => {
  const headers = {
    Accept: "application/json",
    "x-api-key": getApiKeys()[0],
  };

  it("updates location metadata successfully", async () => {
    await createLocation(TestLocation);
    const newName = "New Name";

    let res = await testClient(app).post("update?update_location=1", {
      headers,
      json: {
        id: TestLocation.id,
        name: newName,
      },
    });
    expect(res.statusCode).toBe(200);

    res = await testClient(app).get(`locations/${TestLocation.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("id", TestLocation.id);
    expect(res.body).toHaveProperty("name", newName);
  });

  it("updates availability successfully", async () => {
    await createLocation(TestLocation);

    let res = await testClient(app).post("update", {
      headers,
      json: {
        id: TestLocation.id,
        availability: {
          id: TestLocation.id,
          source: "NJVSS Export",
          available: "NO",
          checked_at: new Date(),
        },
      },
    });
    expect(res.statusCode).toBe(200);

    res = await testClient(app).get(`locations/${TestLocation.id}`);
    expect(res.statusCode).toBe(200);

    expect(res.body).toHaveProperty("id", TestLocation.id);
    expect(res.body.availability).toHaveProperty("available", "NO");

    res = await testClient(app).post("update", {
      headers,
      json: {
        id: TestLocation.id,
        availability: {
          id: TestLocation.id,
          source: "NJVSS Export",
          available: "UNKNOWN",
          checked_at: new Date(),
        },
      },
    });
    expect(res.statusCode).toBe(200);

    res = await testClient(app).get(`locations/${TestLocation.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("id", TestLocation.id);
    expect(res.body.availability).toHaveProperty("available", "UNKNOWN");
  });
});

const TestLocation = {
  id: "47c59c23cbd4672173cc93b8a39b60ddf481dd56",
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
