const path = require("node:path");
const nock = require("nock");
const { checkAvailability } = require("../src/sources/njvss");
const { locationSchema } = require("./support/schemas");

// Mock utils so we can track logs.
jest.mock("../src/utils");

const fixturePath = path.join(__dirname, "fixtures/njvss.fixture.csv");

// Pretend our API has no existing locations.
function mockUnivafLocations(mockedData) {
  nock(process.env.API_URL || "https://localhost:3000")
    .get("/api/edge/locations")
    .query(true)
    .reply(200, { links: {}, data: mockedData });
}

describe("NJVSS", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it.nock("should output valid data", async () => {
    const result = await checkAvailability(() => {});
    expect(result).toContainItemsMatchingSchema(locationSchema);
  });

  it("uses the last-modified header as the valid time", async () => {
    mockUnivafLocations([]);

    // Specify the last-modified time for the CSV from NJVSS.
    nock("https://njvss-pinpoint-reports.s3.us-east-1.amazonaws.com")
      .get("/njvss-available-appointments.csv")
      .query(true)
      .replyWithFile(200, fixturePath, {
        "last-modified": "Tue, 01 May 2023 12:00:00 GMT",
      });

    const result = await checkAvailability(() => {});
    expect(result).toHaveProperty(
      "0.availability.valid_at",
      "2023-05-01T12:00:00.000Z"
    );
  });
});
