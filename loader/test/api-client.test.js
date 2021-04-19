const { UpdateQueue } = require("../src/api-client");

describe("API Client", () => {
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
