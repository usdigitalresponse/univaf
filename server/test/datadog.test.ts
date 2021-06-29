import { installTestDatabaseHooks, useServerForTests } from "./lib";
import app from "../src/app";
import { createLocation, getLocationById, updateAvailability } from "../src/db";
import { TestLocation, TestLocation2 } from "./fixtures";
import { datadogMiddleware, MonitoredRequest, dogstatsd } from "../src/datadog";
import { Response } from "express";

installTestDatabaseHooks();

const mockResponse = () => {
  return ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    on: jest.fn(),
  } as any) as Response;
};

describe("datadog middleware", () => {
  afterEach(() => {
    dogstatsd.mockBuffer = [];
  });

  describe("request handler calling", () => {
    const context = useServerForTests(app);
    it("should call next() once", () => {
      let nextSpy = jest.fn();
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

      expect(dogstatsd.mockBuffer).toHaveLength(2);

      expect(dogstatsd.mockBuffer).toContain(
        "node.express.router.response_total:1|c|#route:/api/edge/locations,method:get,response_code:200"
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
        dogstatsd.mockBuffer.filter(
          (s) =>
            s ===
            "node.express.router.response_total:1|c|#route:/api/edge/locations/:id,method:get,response_code:404"
        )
      ).toHaveLength(2);
    });
  });
});
