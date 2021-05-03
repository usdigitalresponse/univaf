import request from "supertest";
import { getApiKeys } from "../src/config";
import app from "../src/app";

import {
  clearTestDatabase,
  createLocation,
  updateAvailability,
} from "../src/db";

import { Availability } from "../src/interfaces";

beforeEach(async (done) => {
  // N.B. there is only one test database. multiple tests using it simultaneously may lead to unexpected results.
  await clearTestDatabase();
  done();
});

describe("GET /locations", () => {
  it("responds with a list of locations", async (done) => {
    await createLocation(TestLocation);
    await updateAvailability(TestLocation.id, TestLocation.availability);

    const res = await request(app).get("/locations").expect(200);
    expect(res.body).toHaveLength(1);
    done();
  });
});

describe("GET /locations/:id", () => {
  it("responds with location status", async (done) => {
    await createLocation(TestLocation);
    await updateAvailability(TestLocation.id, TestLocation.availability);

    const res = await request(app)
      .get(`/locations/${TestLocation.id}`)
      .expect(200);
    expect(res.body).toHaveProperty("id", TestLocation.id);
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
    await createLocation(TestLocation);
    const newName = "New Name";

    await request(app)
      .post("/update?update_location=1")
      .set("Accept", "application/json")
      .set("x-api-key", getApiKeys()[0])
      .send({
        id: TestLocation.id,
        name: newName,
      })
      .expect(200);

    const res = await request(app)
      .get(`/locations/${TestLocation.id}`)
      .expect(200);
    expect(res.body).toHaveProperty("id", TestLocation.id);
    expect(res.body).toHaveProperty("name", newName);

    done();
  });

  it("updates availability successfully", async (done) => {
    await createLocation(TestLocation);

    await request(app)
      .post("/update")
      .set("Accept", "application/json")
      .set("x-api-key", getApiKeys()[0])
      .send({
        id: TestLocation.id,
        availability: {
          id: TestLocation.id,
          source: "NJVSS Export",
          available: "NO",
          checked_at: new Date(),
        },
      })
      .expect(200);

    let res = await request(app)
      .get(`/locations/${TestLocation.id}`)
      .expect(200);
    expect(res.body).toHaveProperty("id", TestLocation.id);
    expect(res.body.availability).toHaveProperty("available", "NO");

    await request(app)
      .post("/update")
      .set("Accept", "application/json")
      .set("x-api-key", getApiKeys()[0])
      .send({
        id: TestLocation.id,
        availability: {
          id: TestLocation.id,
          source: "NJVSS Export",
          available: "UNKNOWN",
          checked_at: new Date(),
        },
      })
      .expect(200);

    res = await request(app).get(`/locations/${TestLocation.id}`).expect(200);
    expect(res.body).toHaveProperty("id", TestLocation.id);
    expect(res.body.availability).toHaveProperty("available", "UNKNOWN");

    done();
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
