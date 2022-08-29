import type { AddressInfo } from "net";
import { DateTime } from "luxon";
import { createRandomLocation, ndjsonParse } from "./support/lib";
import { installTestDatabaseHooks } from "./support/database-testing";
import { useServerForTests } from "./support/server-testing";
import app from "../src/app";
import { createLocation } from "../src/db";
import { TestLocation } from "./fixtures";
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

  it("handles a urlencoded $ in path", async () => {
    const res = await context.client.get("smart-scheduling/%24bulk-publish");
    expect(res.statusCode).toBe(200);

    const data = res.body as any;
    expect(data.output).toHaveLength(50 * 3); // 50 states, Location/Schedule/Slot
  });
});

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

  describe("`has-availability` extension", () => {
    const extension =
      "http://fhir-registry.smarthealthit.org/StructureDefinition/has-availability";

    // Takes `LocationAvailability.available` value and
    // expected `has-availability` extension value in SMART SL.
    it.each([
      [Availability.YES, "some"],
      [Availability.NO, "none"],
      [Availability.UNKNOWN, "unknown"],
      // Test no availability record at all.
      [null, "unknown"],
    ])("represents %j as %j", async (available, expected) => {
      const location = await createRandomLocation({
        availability: available && { available },
      });
      const response = await context.client<any[]>(
        `smart-scheduling/schedules/states/${location.state}.ndjson`,
        { parseJson: ndjsonParse }
      );

      expect(response.body[0].extension).toContainEqual({
        url: extension,
        valueCode: expected,
      });
    });
  });

  it("includes products as extensions", async () => {
    const location = await createRandomLocation({
      availability: {
        available: Availability.YES,
        products: ["moderna", "jj"],
      },
    });

    const url = `smart-scheduling/schedules/states/${location.state}.ndjson`;
    const response = await context.client.get(url, { responseType: "text" });
    expect(response.statusCode).toBe(200);
    const data = ndjsonParse(response.body);

    expect(data[0].extension).toContainEqual({
      url: "http://fhir-registry.smarthealthit.org/StructureDefinition/vaccine-product",
      valueCoding: {
        system: "http://hl7.org/fhir/sid/cvx",
        code: 207,
        display: "Moderna",
      },
    });
    expect(data[0].extension).toContainEqual({
      url: "http://fhir-registry.smarthealthit.org/StructureDefinition/vaccine-product",
      valueCoding: {
        system: "http://hl7.org/fhir/sid/cvx",
        code: 212,
        display: "Johnson & Johnson",
      },
    });
  });
});

describe("GET /smart-scheduling/slots/states/:state.ndjson", () => {
  const context = useServerForTests(app);

  it("doesn't show slots for locations with unknown availability", async () => {
    await createLocation(TestLocation);

    const url = `smart-scheduling/slots/states/${TestLocation.state}.ndjson`;
    const response = await context.client.get(url, { responseType: "text" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveLength(0);
  });

  it("responds with all the relevant slots", async () => {
    const location = await createRandomLocation({
      availability: {
        slots: [
          {
            start: DateTime.utc().toISO(),
            end: DateTime.utc().plus({ minutes: 10 }).toISO(),
            available: Availability.YES,
          },
          {
            start: DateTime.utc().plus({ minutes: 10 }).toISO(),
            end: DateTime.utc().plus({ minutes: 20 }).toISO(),
            available: Availability.NO,
          },
        ],
      },
    });

    const url = `smart-scheduling/slots/states/${location.state}.ndjson`;
    const response = await context.client.get(url, { responseType: "text" });
    expect(response.statusCode).toBe(200);
    const data = ndjsonParse(response.body);
    expect(data).toHaveLength(2);
    expect(data[0]).toHaveProperty("status", "free");
    expect(data[1]).toHaveProperty("status", "busy");
  });

  it("responds capacity-based slots if we don't know slots", async () => {
    const location = await createRandomLocation({
      availability: {
        capacity: [
          {
            date: DateTime.utc().toISODate(),
            available: Availability.YES,
            available_count: 10,
          },
          {
            date: DateTime.utc().plus({ days: 1 }).toISODate(),
            available: Availability.NO,
            available_count: 0,
          },
        ],
      },
    });

    const url = `smart-scheduling/slots/states/${location.state}.ndjson`;
    const response = await context.client.get(url, { responseType: "text" });
    expect(response.statusCode).toBe(200);
    const data = ndjsonParse(response.body);
    expect(data).toHaveLength(2);

    expect(data[0]).toHaveProperty("status", "free");
    expect(data[0].extension).toContainEqual({
      url: "http://fhir-registry.smarthealthit.org/StructureDefinition/slot-capacity",
      valueInteger: 10,
    });

    expect(data[1]).toHaveProperty("status", "busy");
    expect(data[1].extension).toContainEqual({
      url: "http://fhir-registry.smarthealthit.org/StructureDefinition/slot-capacity",
      valueInteger: 0,
    });
  });
});
