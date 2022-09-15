import { installTestDatabaseHooks } from "./support/database-testing";
import { useServerForTests } from "./support/server-testing";
import app from "../src/app";
import {
  datadogMiddleware,
  MonitoredRequest,
  dogMetrics,
} from "../src/datadog";
import { Response } from "express";

installTestDatabaseHooks();

const mockResponse = () => {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    on: jest.fn(),
  } as any as Response;
};

describe("datadog middleware", () => {
  const context = useServerForTests(app);

  afterEach(() => {
    if ("mockBuffer" in dogMetrics) {
      dogMetrics.mockBuffer = [];
    } else {
      // @ts-expect-error dogMetrics.aggregator is not in the typings.
      dogMetrics.aggregator.flush();
    }
  });

  it("should call next() once", () => {
    const nextSpy = jest.fn();
    const mockRequest = {
      body: {},
    } as MonitoredRequest;
    const res = mockResponse();

    datadogMiddleware(mockRequest, res, nextSpy);
    expect(nextSpy.mock.calls).toHaveLength(1);
  });

  it("should have correct metrics on single endpoint call", async () => {
    const res = await context.client.get<any>("api/edge/locations");
    expect(res.statusCode).toBe(200);

    if ("mockBuffer" in dogMetrics) {
      // One of this stat, with a value of 1, and a correct response_code tag.
      const responseCounts = dogMetrics.mockBuffer.filter((s) =>
        s.startsWith("node.express.router.response_total:")
      );
      expect(responseCounts).toHaveLength(1);
      expect(responseCounts[0]).toMatch(/^[\w.]+:1\b/);
      expect(responseCounts[0]).toMatch(/\bresponse_code:200\b/);

      // One of this stat.
      const responseTimes = dogMetrics.mockBuffer.filter((s) =>
        s.startsWith("node.express.router.response_time:")
      );
      expect(responseTimes).toHaveLength(1);
    } else {
      // @ts-expect-error They typings are missing `aggregator`.
      const buffer: any[] = Object.values(dogMetrics.aggregator.buffer);
      const responseCounts = buffer.filter(
        (m) => m.key === "node.express.router.response_total"
      );
      expect(responseCounts).toHaveLength(1);
      expect(responseCounts[0]).toHaveProperty("value", 1);
      expect(responseCounts[0]).toHaveProperty(
        "tags",
        expect.arrayContaining(["response_code:200"])
      );

      const responseTimes = buffer.filter(
        (m) => m.key === "node.express.router.response_time"
      );
      expect(responseTimes).toHaveLength(1);
    }
  });

  it("should have correct metrics on two endpoint calls", async () => {
    let res = await context.client.get<any>(`api/edge/locations/x`, {
      retry: 0,
    });
    expect(res.statusCode).toBe(404);

    res = await context.client.get<any>(`api/edge/locations/x`, { retry: 0 });
    expect(res.statusCode).toBe(404);

    if ("mockBuffer" in dogMetrics) {
      const responseCounts = dogMetrics.mockBuffer.filter((s) =>
        s.startsWith("node.express.router.response_total:")
      );
      expect(responseCounts).toHaveLength(2);
      expect(responseCounts[0]).toMatch(/\bresponse_code:404\b/);
      expect(responseCounts[1]).toMatch(/\bresponse_code:404\b/);
    } else {
      // @ts-expect-error They typings are missing `aggregator`.
      const buffer: any[] = Object.values(dogMetrics.aggregator.buffer);
      const responseCounts = buffer.filter(
        (m) => m.key === "node.express.router.response_total"
      );
      expect(responseCounts).toHaveLength(1);
      expect(responseCounts[0]).toHaveProperty("value", 2);
    }
  });
});
