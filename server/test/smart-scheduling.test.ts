import type { AddressInfo } from "net";
import { useServerForTests, installTestDatabaseHooks } from "./lib";
import { getApiKeys } from "../src/config";
import app from "../src/app";
import { createLocation, getLocationById, updateAvailability } from "../src/db";

import { Availability } from "../src/interfaces";

installTestDatabaseHooks();

describe("GET /smart-scheduling/$bulk-publish", () => {
  const context = useServerForTests(app);

  it("responds with a manifest", async () => {
    const res = await context.client.get("smart-scheduling/$bulk-publish");
    expect(res.statusCode).toBe(200);

    const data = res.body as any;
    expect(data.output).toBeDefined();
    expect(data.output).toHaveLength(50 * 3); // 50 states, Location/Schedule/Slot

    const { port } = context.server.address() as AddressInfo;
    expect(data.request).toContain(`:${port}`);
  });
});

function ndjsonParse(s: string): any {
  return s.split("\n").map((l) => JSON.parse(l));
}

describe("GET /smart-scheduling/locations/states/:state.ndjson", () => {
  const context = useServerForTests(app);

  it("responds with a list of locations", async () => {
    const url = `smart-scheduling/locations/states/${TestLocation.state}.ndjson`;

    let res = await context.client.get(url, { responseType: "text" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(0);

    await createLocation(TestLocation);

    res = await context.client.get(url, { responseType: "text" });
    expect(res.statusCode).toBe(200);
    const data = ndjsonParse(res.body);
    expect(data).toHaveLength(1);
  });
});

describe("GET /smart-scheduling/schedules/states/:state.ndjson", () => {
  const context = useServerForTests(app);

  it("responds with a list of schedules", async () => {
    const url = `smart-scheduling/schedules/states/${TestLocation.state}.ndjson`;

    let res = await context.client.get(url, { responseType: "text" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(0);

    await createLocation(TestLocation);

    res = await context.client.get(url, { responseType: "text" });
    expect(res.statusCode).toBe(200);
    const data = ndjsonParse(res.body);
    expect(data).toHaveLength(1);
  });
});

describe("GET /smart-scheduling/slots/states/:state.ndjson", () => {
  const context = useServerForTests(app);

  it("responds with a list of slots", async () => {
    const url = `smart-scheduling/slots/states/${TestLocation.state}.ndjson`;

    let res = await context.client.get(url, { responseType: "text" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(0);

    await createLocation(TestLocation);

    res = await context.client.get(url, { responseType: "text" });
    expect(res.statusCode).toBe(200);
    const data = ndjsonParse(res.body);
    expect(data).toHaveLength(1);
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
