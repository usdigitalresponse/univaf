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

// Replace metrics methods with mocks. Note we can't mock the module, because
// we are testing things inside the module (the middleware) that will see the
// actual implementation instead of the mock if we do so.
const incrementMock = jest.spyOn(dogMetrics, "increment");
const gaugeMock = jest.spyOn(dogMetrics, "gauge");
const histogramMock = jest.spyOn(dogMetrics, "histogram");

/**
 * Get an array of all the calls that recorded a given metric name.
 */
function callsForMetric(mock: jest.MockInstance<any, any>, metric: string) {
  return mock.mock.calls.filter((s) => (s[0] as string).startsWith(metric));
}

describe("datadog middleware", () => {
  const context = useServerForTests(app);

  afterEach(() => {
    incrementMock.mockClear();
    gaugeMock.mockClear();
    histogramMock.mockClear();
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

    // Submitted one response_total metric and one response_time metric.
    const responseCounts = callsForMetric(
      incrementMock,
      "node.express.router.response_total"
    );
    expect(responseCounts).toHaveLength(1);
    expect(responseCounts[0]).toEqual([
      "node.express.router.response_total",
      1,
      [
        "route:/api/edge/locations",
        "method:get",
        "response_code:200",
        "internal:false",
      ],
    ]);

    const responseTimes = callsForMetric(
      histogramMock,
      "node.express.router.response_time"
    );
    expect(responseTimes).toHaveLength(1);
    expect(responseTimes[0]).toEqual([
      "node.express.router.response_time",
      expect.any(Number),
      [
        "route:/api/edge/locations",
        "method:get",
        "response_code:200",
        "internal:false",
      ],
    ]);
  });

  it("should have correct metrics on two endpoint calls", async () => {
    let res = await context.client.get<any>(`api/edge/locations/x`, {
      retry: 0,
    });
    expect(res.statusCode).toBe(404);

    res = await context.client.get<any>(`api/edge/locations/x`, { retry: 0 });
    expect(res.statusCode).toBe(404);

    // Submitted 2 response_total metrics.
    const responseCounts = callsForMetric(
      incrementMock,
      "node.express.router.response_total"
    );
    expect(responseCounts).toHaveLength(2);
    expect(responseCounts[0][2]).toContain("response_code:404");
    expect(responseCounts[1][2]).toContain("response_code:404");
  });
});
