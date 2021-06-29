import type { AddressInfo } from "net";
import { useServerForTests, installTestDatabaseHooks } from "./lib";
import app from "../src/app";
import { createLocation } from "../src/db";
import { TestLocation } from "./fixtures";

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

function ndjsonParse(s: string): any {
  return s
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
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
