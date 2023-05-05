const { checkAvailability } = require("../src/sources/albertsons/scraper");
const { locationSchema } = require("./support/schemas");

// Mock utils so we can track logs.
jest.mock("../src/utils");

describe("Albertsons Scraper", () => {
  it.nock("should output valid data", async () => {
    const result = await checkAvailability(() => {}, { states: ["NJ"] });
    expect(result).toContainItemsMatchingSchema(locationSchema);
    expect(result.length).toBeGreaterThan(0);
  });
});
