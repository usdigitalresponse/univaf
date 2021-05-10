import request from "supertest";
import { getApiKeys } from "../src/config";
import app from "../src/app";
import { startTransaction, rollbackTransaction } from "../src/db";

import {
  clearTestDatabase,
  createLocation,
  getLocationById,
  updateAvailability,
} from "../src/db";

import { Availability } from "../src/interfaces";

beforeAll(async (done) => {
  // N.B. there is only one test database. multiple tests using it simultaneously may lead to unexpected results.
  await clearTestDatabase();
  done();
});

beforeEach(startTransaction);
afterEach(rollbackTransaction);

describe("GET /locations", () => {
  it("responds with a list of locations", async (done) => {
    const location = await createLocation(TestLocation);
    await updateAvailability(location.id, TestLocation.availability);

    const res = await request(app).get("/locations").expect(200);
    expect(res.body).toHaveLength(1);
    done();
  });
});

describe("GET /locations/:id", () => {
  it("responds with location status", async (done) => {
    const location = await createLocation(TestLocation);
    await updateAvailability(location.id, TestLocation.availability);

    const res = await request(app).get(`/locations/${location.id}`).expect(200);
    expect(res.body).toHaveProperty("id", location.id);
    expect(res.body).toHaveProperty("name", TestLocation.name);
    expect(res.body).toHaveProperty(
      "location_type",
      TestLocation.location_type
    );

    done();
  });
});

describe("POST /update", () => {
  it("updates location metadata successfully", async (done) => {
    const location = await createLocation(TestLocation);
    const newName = "New Name";

    await request(app)
      .post("/update?update_location=1")
      .set("Accept", "application/json")
      .set("x-api-key", getApiKeys()[0])
      .send({
        id: location.id,
        name: newName,
      })
      .expect(200);

    const res = await request(app).get(`/locations/${location.id}`).expect(200);
    expect(res.body).toHaveProperty("id", location.id);
    expect(res.body).toHaveProperty("name", newName);

    done();
  });

  it("updates availability successfully", async (done) => {
    const location = await createLocation(TestLocation);

    await request(app)
      .post("/update")
      .set("Accept", "application/json")
      .set("x-api-key", getApiKeys()[0])
      .send({
        id: location.id,
        availability: {
          source: "NJVSS Export",
          available: "NO",
          checked_at: new Date(),
        },
      })
      .expect(200);

    let res = await request(app).get(`/locations/${location.id}`).expect(200);
    expect(res.body).toHaveProperty("id", location.id);
    expect(res.body.availability).toHaveProperty("available", "NO");

    await request(app)
      .post("/update")
      .set("Accept", "application/json")
      .set("x-api-key", getApiKeys()[0])
      .send({
        id: location.id,
        availability: {
          source: "NJVSS Export",
          available: "UNKNOWN",
          checked_at: new Date(),
        },
      })
      .expect(200);

    res = await request(app).get(`/locations/${location.id}`).expect(200);
    expect(res.body).toHaveProperty("id", location.id);
    expect(res.body.availability).toHaveProperty("available", "UNKNOWN");

    done();
  });

  it("updates location metadata based on `external_ids` if location matching `id` does not exist", async (done) => {
    const location = await createLocation(TestLocation);
    const newName = "New Name";
    const externalId = Object.entries(TestLocation.external_ids)[0];

    await request(app)
      .post("/update?update_location=1")
      .set("Accept", "application/json")
      .set("x-api-key", getApiKeys()[0])
      .send({
        id: "abc123",
        external_ids: {
          [externalId[0]]: externalId[1],
        },
        name: newName,
      })
      .expect(200);

    const result = await getLocationById(location.id);
    expect(result).toHaveProperty("name", newName);

    done();
  });

  it("updates location metadata based on `external_ids` if `id` is not in update data", async (done) => {
    const location = await createLocation(TestLocation);
    const newName = "New Name";
    const externalId = Object.entries(TestLocation.external_ids)[0];

    await request(app)
      .post("/update?update_location=1")
      .set("Accept", "application/json")
      .set("x-api-key", getApiKeys()[0])
      .send({
        external_ids: {
          [externalId[0]]: externalId[1],
        },
        name: newName,
      })
      .expect(200);

    const result = await getLocationById(location.id);
    expect(result).toHaveProperty("name", newName);

    done();
  });

  it("should not update based on vtrcks PINs", async (done) => {
    await createLocation(TestLocation);
    const newName = "New Name";

    await request(app)
      .post("/update?update_location=1")
      .set("Accept", "application/json")
      .set("x-api-key", getApiKeys()[0])
      .send({
        external_ids: {
          vtrcks: TestLocation.external_ids.vtrcks,
        },
        name: newName,
      })
      .expect(201);

    done();
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
