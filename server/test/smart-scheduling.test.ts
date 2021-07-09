import type { AddressInfo } from "net";
import {
  useServerForTests,
  installTestDatabaseHooks,
  ndjsonParse,
} from "./lib";
import app from "../src/app";
import { createLocation, updateAvailability } from "../src/db";
import { TestLocation, TestLocation2 } from "./fixtures";
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

  it("shows available with `has-availability` extension", async () => {
    let location = await createLocation(TestLocation);
    await updateAvailability(location.id, {
      ...TestLocation.availability,
      available: Availability.YES,
    });
    location = await createLocation({
      ...TestLocation2,
      state: TestLocation.state,
    });
    await updateAvailability(location.id, {
      ...TestLocation.availability,
      available: Availability.NO,
    });
    location = await createLocation({
      ...TestLocation,
      id: "123",
      external_ids: [["random", "value"]],
    });
    await updateAvailability(location.id, {
      ...TestLocation.availability,
      available: Availability.UNKNOWN,
    });
    // This location has no availability record at all.
    await createLocation({
      ...TestLocation,
      id: "456",
      external_ids: [["another", "value"]],
    });

    const url = `smart-scheduling/schedules/states/${TestLocation.state}.ndjson`;
    const response = await context.client.get(url, { responseType: "text" });
    expect(response.statusCode).toBe(200);
    const data = ndjsonParse(response.body);
    expect(data).toHaveLength(4);

    const extension =
      "http://fhir-registry.smarthealthit.org/StructureDefinition/has-availability";
    expect(data[0].extension).toContainEqual({
      url: extension,
      valueCode: "some",
    });
    expect(data[1].extension).toContainEqual({
      url: extension,
      valueCode: "none",
    });
    expect(data[2].extension).toContainEqual({
      url: extension,
      valueCode: "unknown",
    });
    expect(data[3].extension).toContainEqual({
      url: extension,
      valueCode: "unknown",
    });
  });

  it("includes products as extensions", async () => {
    const location = await createLocation(TestLocation);
    await updateAvailability(location.id, {
      ...TestLocation.availability,
      available: Availability.YES,
      products: ["moderna", "jj"],
    });

    const url = `smart-scheduling/schedules/states/${TestLocation.state}.ndjson`;
    const response = await context.client.get(url, { responseType: "text" });
    expect(response.statusCode).toBe(200);
    const data = ndjsonParse(response.body);

    expect(data[0].extension).toContainEqual({
      url:
        "http://fhir-registry.smarthealthit.org/StructureDefinition/vaccine-product",
      valueCoding: {
        system: "http://hl7.org/fhir/sid/cvx",
        code: 207,
        display: "Moderna",
      },
    });
    expect(data[0].extension).toContainEqual({
      url:
        "http://fhir-registry.smarthealthit.org/StructureDefinition/vaccine-product",
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
    const location = await createLocation(TestLocation);
    await updateAvailability(location.id, {
      ...TestLocation.availability,
      slots: [
        {
          start: new Date(),
          end: new Date(Date.now() + 10 * 60 * 1000),
          available: Availability.YES,
        },
        {
          start: new Date(Date.now() + 10 * 60 * 1000),
          end: new Date(Date.now() + 20 * 60 * 1000),
          available: Availability.NO,
        },
      ],
    });

    const url = `smart-scheduling/slots/states/${TestLocation.state}.ndjson`;
    const response = await context.client.get(url, { responseType: "text" });
    expect(response.statusCode).toBe(200);
    const data = ndjsonParse(response.body);
    expect(data).toHaveLength(2);
    expect(data[0]).toHaveProperty("status", "free");
    expect(data[1]).toHaveProperty("status", "busy");
  });

  it("responds capacity-based slots if we don't know slots", async () => {
    const location = await createLocation(TestLocation);
    await updateAvailability(location.id, {
      ...TestLocation.availability,
      capacity: [
        {
          date: new Date().toISOString().slice(0, 10),
          available: Availability.YES,
          available_count: 10,
        },
        {
          date: new Date(Date.now() + 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10),
          available: Availability.NO,
          available_count: 0,
        },
      ],
    });

    const url = `smart-scheduling/slots/states/${TestLocation.state}.ndjson`;
    const response = await context.client.get(url, { responseType: "text" });
    expect(response.statusCode).toBe(200);
    const data = ndjsonParse(response.body);
    expect(data).toHaveLength(2);

    expect(data[0]).toHaveProperty("status", "free");
    expect(data[0].extension).toContainEqual({
      url:
        "http://fhir-registry.smarthealthit.org/StructureDefinition/slot-capacity",
      valueInteger: 10,
    });

    expect(data[1]).toHaveProperty("status", "busy");
    expect(data[1].extension).toContainEqual({
      url:
        "http://fhir-registry.smarthealthit.org/StructureDefinition/slot-capacity",
      valueInteger: 0,
    });
  });
});
