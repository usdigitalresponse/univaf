const path = require("path");
const fs = require("fs/promises");
const nock = require("nock");
const {
  API_HOST,
  API_PATH,
  checkAvailability,
} = require("../src/sources/cdc/api");
const { Available } = require("../src/model");

describe("CDC Open Data API", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  const fixturePath = path.join(__dirname, "fixtures/cdc.api.01929.json");

  it("should only show products that are in stock", async () => {
    // This fixture lists Moderna, Pfizer, and J&J products, but only Pfizer is
    // flagged as in stock.
    nock(API_HOST).get(API_PATH).query(true).replyWithFile(200, fixturePath, {
      "Content-Type": "application/json",
    });

    const locations = await checkAvailability(() => null, { states: "NJ" });
    expect(locations).toHaveLength(1);
    expect(locations[0]).toHaveProperty("availability.products", ["pfizer"]);
  });

  it("should report availability based on supply and stock", async () => {
    const baseEntry = JSON.parse(await fs.readFile(fixturePath, "utf8"))[0];
    nock(API_HOST)
      .get(API_PATH)
      .query(true)
      .reply(200, [
        {
          ...baseEntry,
          provider_location_guid: "a",
          in_stock: true,
          supply_level: "2",
        },
        {
          ...baseEntry,
          provider_location_guid: "b",
          in_stock: false,
          supply_level: "0",
        },
        {
          ...baseEntry,
          provider_location_guid: "c",
          in_stock: false,
          supply_level: "-1",
        },
      ]);

    const locations = await checkAvailability(() => null, { states: "NJ" });
    expect(locations).toHaveProperty("0.availability.available", Available.yes);
    expect(locations).toHaveProperty("1.availability.available", Available.no);
    expect(locations).toHaveProperty(
      "2.availability.available",
      Available.unknown
    );
  });

  it("reports unknown availability if `in_stock` and `supply_level` conflict", async () => {
    const baseEntry = JSON.parse(await fs.readFile(fixturePath, "utf8"))[0];
    nock(API_HOST)
      .get(API_PATH)
      .query(true)
      .reply(200, [
        {
          ...baseEntry,
          provider_location_guid: "a",
          in_stock: false,
          supply_level: "1",
        },
        {
          ...baseEntry,
          provider_location_guid: "b",
          in_stock: true,
          supply_level: "0",
        },
      ]);

    const locations = await checkAvailability(() => null, { states: "NJ" });
    expect(locations).toHaveProperty(
      "0.availability.available",
      Available.unknown
    );
    expect(locations).toHaveProperty(
      "1.availability.available",
      Available.unknown
    );
  });
});
