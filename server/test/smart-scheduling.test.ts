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
