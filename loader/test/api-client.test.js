const { UpdateQueue, ApiClient } = require("../src/api-client");
const nock = require("nock");

// Mock utils so we can track logs.
jest.mock("../src/utils");

const MOCK_HOST = "http://univaf.test";

describe("API Client", () => {
  describe("getLocations", () => {
    it("handles paginated results", async () => {
      nock(MOCK_HOST)
        .get("/api/edge/locations")
        .reply(200, {
          links: { next: "/api/edge/locations?p2" },
          data: [{ id: 1 }],
        });
      nock(MOCK_HOST)
        .get("/api/edge/locations?p2")
        .reply(200, {
          links: {},
          data: [{ id: 2 }],
        });

      const client = new ApiClient(MOCK_HOST, "abc");
      const result = await client.getLocations();
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });

  describe("sendUpdate", () => {
    it("sends data", async () => {
      nock(MOCK_HOST)
        .post("/api/edge/update")
        .query({ test: "value" })
        .reply(200, {
          data: {
            location: { action: "created" },
            availability: { action: "created" },
          },
        });

      const client = new ApiClient(MOCK_HOST, "abc");
      const result = await client.sendUpdate({ id: 1 }, { test: "value" });
      expect(result).toEqual({
        data: {
          location: { action: "created" },
          availability: { action: "created" },
        },
      });
    });
  });

  describe("UpdateQueue", () => {
    it("should limit concurrent calls", async () => {
      let currentCalls = 0;
      let maxCalls = 0;
      const mockClient = {
        sendUpdate(update, _options) {
          currentCalls++;
          maxCalls = Math.max(currentCalls, maxCalls);
          return new Promise((resolve) =>
            setTimeout(() => {
              currentCalls--;
              resolve(update);
            }, 50)
          );
        },
      };

      const queue = new UpdateQueue(mockClient, { concurrency: 4 });
      for (let i = 0; i < 10; i++) {
        queue.push({ data: i });
      }

      await queue.whenDone();
      expect(maxCalls).toBe(4);
    });

    it("should return results from whenDone()", async () => {
      const mockClient = {
        async sendUpdate(update, _options) {
          return update;
        },
      };

      const queue = new UpdateQueue(mockClient, { concurrency: 4 });
      const expected = [];
      for (let i = 0; i < 10; i++) {
        queue.push({ data: i });
        expected.push({ data: i });
      }

      let results = await queue.whenDone();
      // We don't expect results to be in order.
      results = results.sort((a, b) => a.data - b.data);
      expect(results).toEqual(expected);
    });
  });
});
