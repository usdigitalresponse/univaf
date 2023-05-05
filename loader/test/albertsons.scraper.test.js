const nock = require("nock");
const {
  API_URL,
  checkAvailability,
} = require("../src/sources/albertsons/scraper");
const { splitHostAndPath } = require("./support");
const { locationSchema } = require("./support/schemas");

// Mock utils so we can track logs.
jest.mock("../src/utils");

const [API_URL_BASE, API_URL_PATH] = splitHostAndPath(API_URL);

describe("Albertsons Scraper", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it.nock("should output valid data", async () => {
    const result = await checkAvailability(() => {}, { states: ["NJ"] });
    expect(result).toContainItemsMatchingSchema(locationSchema);
    expect(result.length).toBeGreaterThan(0);
  });

  // Needed since "unavailable" locations don't show in the API, so they come
  // from different underlying data.
  it("should output valid data for unavailable locations", async () => {
    nock(API_URL_BASE).post(API_URL_PATH).reply(200, []);
    const result = await checkAvailability(() => {}, { states: ["DC"] });
    expect(result).toContainItemsMatchingSchema(locationSchema);
    expect(result.length).toBeGreaterThan(0);
  });
});
