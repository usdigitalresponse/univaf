import { datadogMiddleware, MonitoredRequest } from "../src/datadog";
import { Response } from "express";
import sinon from "sinon";

const mockResponse = () => {
  const res = {} as Response;
  res.status = sinon.stub().returns(res);
  res.json = sinon.stub().returns(res);
  res.on = jest.fn();
  return res;
};

describe("datadog middleware", function () {
  describe("request handler creation", function () {
    it("should return a function()", function () {
      expect(typeof datadogMiddleware).toBe("function");
    });

    it("should accept three arguments", function () {
      expect(datadogMiddleware.length).toEqual(3);
    });
  });

  describe("request handler calling", function () {
    it("should call next() once", function () {
      var nextSpy = sinon.spy();
      const mockRequest = {
        body: {},
      } as MonitoredRequest;
      const res = mockResponse();
      datadogMiddleware(mockRequest, res, nextSpy);
      expect(nextSpy.calledOnce).toEqual(true);
    });
    it("should handle paths", function () {
      var nextSpy = sinon.spy();
      const mockRequest = {
        body: {},
        route: {
          path: "/api/edge/locations",
        },
      } as MonitoredRequest;
      const res = mockResponse();

      datadogMiddleware(mockRequest, res, nextSpy);
      expect(nextSpy.calledOnce).toEqual(true);
    });
  });
});
