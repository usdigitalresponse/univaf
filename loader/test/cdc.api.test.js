const path = require("path");
const nock = require("nock");
const {
  API_HOST,
  API_PATH,
  checkAvailability,
} = require("../src/sources/cdc/api");

describe("CDC Open Data API", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("should only show products that are in stock", async () => {
    // This fixture lists Moderna, Pfizer, and J&J products, but only Pfizer is
    // flagged as in stock.
    nock(API_HOST)
      .get(API_PATH)
      .query(true)
      .replyWithFile(200, path.join(__dirname, "fixtures/cdc.api.01929.json"), {
        "Content-Type": "application/json",
      });

    const locations = await checkAvailability(() => null, { states: "NJ" });
    expect(locations).toHaveLength(1);
    expect(locations[0]).toHaveProperty("availability.products", ["pfizer"]);
  });
});
