import {
  expectDatetimeString,
  installTestDatabaseHooks,
  useServerForTests,
} from "./lib";
import app from "../src/app";
import { createLocation, getLocationById, updateAvailability } from "../src/db";
import { TestLocation, TestLocation2 } from "./fixtures";
import { datadogMiddleware, MonitoredRequest, dogstatsd } from "../src/datadog";
import { Response } from "express";
import sinon from "sinon";
installTestDatabaseHooks();

const mockResponse = () => {
  const res = {} as Response;
  res.status = sinon.stub().returns(res);
  res.json = sinon.stub().returns(res);
  res.on = jest.fn();
  return res;
};

describe("datadog middleware", () => {
  afterEach(() => {
    dogstatsd.mockBuffer = [];
  });

  describe("request handler creation", () => {
    it("should return a function()", () => {
      expect(typeof datadogMiddleware).toBe("function");
    });

    it("should accept three arguments", () => {
      expect(datadogMiddleware.length).toEqual(3);
    });
  });

  describe("request handler calling", () => {
    const context = useServerForTests(app);
    it("should call next() once", () => {
      var nextSpy = sinon.spy();
      const mockRequest = {
        body: {},
      } as MonitoredRequest;
      const res = mockResponse();
      datadogMiddleware(mockRequest, res, nextSpy);
      expect(nextSpy.calledOnce).toEqual(true);
    });
    it("should have correct metrics on single endpoint call", async () => {
      const location = await createLocation(TestLocation);
      await updateAvailability(location.id, TestLocation.availability);
      const res = await context.client.get<any>("api/edge/locations");
      expect(res.statusCode).toBe(200);

      expect(dogstatsd.mockBuffer).toHaveLength(2);

      expect(dogstatsd.mockBuffer).toContain(
        "node.express.router.response_total:1|c|#route:/api/edge/locations,method:get,response_code:200"
      );
      expect(dogstatsd.mockBuffer[1]).toMatch(
        /node.express.router.response_time.*/
      );
    });
    it("should have correct metrics on two endpoint calls", async () => {
      const location = await createLocation(TestLocation);
      await updateAvailability(location.id, TestLocation.availability);
      var res = await context.client.get<any>(
        `api/edge/locations/${location.id}`
      );
      expect(res.statusCode).toBe(200);
      res = await context.client.get<any>(`api/edge/locations/${location.id}`);
      expect(res.statusCode).toBe(200);

      expect(
        dogstatsd.mockBuffer.filter(
          (s) =>
            s ===
            "node.express.router.response_total:1|c|#route:/api/edge/locations/:id,method:get,response_code:200"
        )
      ).toHaveLength(2);
    });
  });
});
