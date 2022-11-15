import { afterEach, describe, expect, jest, it } from "@jest/globals";
import { installTestDatabaseHooks } from "./support/database-testing";
import { useServerForTests } from "./support/server-testing";
import app from "../src/app";
import { datadogMiddleware, MonitoredRequest, dogstatsd } from "../src/datadog";
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
    dogstatsd.mockBuffer = [];
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

    const middlewareMetrics = dogstatsd.mockBuffer.filter((s) =>
      s.startsWith("node.express.router.")
    );
    expect(middlewareMetrics).toHaveLength(2);

    expect(dogstatsd.mockBuffer).toContainEqual(
      expect.stringMatching(
        /^node\.express\.router\.response_total:1\|c\|#.*response_code:200.*/
      )
    );
    expect(dogstatsd.mockBuffer).toContainEqual(
      expect.stringMatching(/^node\.express\.router\.response_time:/)
    );
  });

  it("should have correct metrics on two endpoint calls", async () => {
    let res = await context.client.get<any>(`api/edge/locations/x`, {
      retry: 0,
    });
    expect(res.statusCode).toBe(404);

    res = await context.client.get<any>(`api/edge/locations/x`, { retry: 0 });
    expect(res.statusCode).toBe(404);

    expect(
      dogstatsd.mockBuffer.filter((s) =>
        /^node\.express\.router\.response_total:1\|c\|#.*route:\/api\/edge\/locations\/:id.*response_code:404.*/.test(
          s
        )
      )
    ).toHaveLength(2);
  });
});
