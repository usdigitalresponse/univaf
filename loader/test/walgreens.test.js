const nock = require("nock");
const { checkAvailability, API_URL } = require("../src/sources/walgreens");
const {
  expectDatetimeString,
  splitHostAndPath,
  toNdJson,
} = require("./support");
const fixtures = require("./fixtures/walgreens.smart.fixtures");
const { Available } = require("../src/model");

describe("Walgreens SMART Scheduling Links API", () => {
  const [API_BASE, API_MANIFEST_PATH] = splitHostAndPath(API_URL);

  it("should load Walgreens SMART API data", async () => {
    nock(API_BASE).get(API_MANIFEST_PATH).reply(200, fixtures.TestManifest);
    nock(API_BASE)
      .get("/fhir/locations.ndjson")
      .reply(200, toNdJson(fixtures.TestLocations));
    nock(API_BASE)
      .get("/fhir/schedules.ndjson")
      .reply(200, toNdJson(fixtures.TestSchedules));
    nock(API_BASE)
      .get("/fhir/Slot-abc.ndjson")
      .reply(200, toNdJson(fixtures.TestSlots));

    const result = await checkAvailability(() => null, { states: "AK" });
    expect(result).toEqual([
      {
        external_ids: [
          ["walgreens_smart", "13656"],
          ["npi_usa", "1598055964"],
          ["walgreens", "13656"],
        ],
        location_type: "PHARMACY",
        provider: "walgreens",
        name: "Walgreens #13656",
        address_lines: ["725 E NORTHERN LIGHTS BLVD"],
        city: "Anchorage",
        postal_code: "99503",
        state: "AK",
        county: "Anchorage",
        position: {
          latitude: 61.19594828,
          longitude: -149.86860492,
        },

        info_phone: "907-6448400",
        info_url: "https://www.walgreens.com/locator/store/id=13656",
        booking_phone: "1-800-925-4733",
        booking_url: "https://www.walgreens.com/findcare/vaccination/covid-19",

        availability: {
          source: "univaf-walgreens-smart",
          available: "YES",
          checked_at: expectDatetimeString(),
          valid_at: "2021-10-20T01:31:57.102Z",
          is_public: true,
          capacity: undefined,
        },
      },
    ]);

    // Expect the `checked_at` time to be recent.
    const checkedDate = new Date(result[0].availability.checked_at);
    expect(Date.now() - checkedDate).toBeLessThan(1000);
  });

  it("should set availability to NO if no slots are free", async () => {
    nock(API_BASE).get(API_MANIFEST_PATH).reply(200, fixtures.TestManifest);
    nock(API_BASE)
      .get("/fhir/locations.ndjson")
      .reply(200, toNdJson(fixtures.TestLocations));
    nock(API_BASE)
      .get("/fhir/schedules.ndjson")
      .reply(200, toNdJson(fixtures.TestSchedules));
    nock(API_BASE)
      .get("/fhir/Slot-abc.ndjson")
      .reply(
        200,
        toNdJson(
          fixtures.TestSlots.map((slot) => ({ ...slot, status: "busy" }))
        )
      );

    const result = await checkAvailability(() => null, { states: "AK" });
    expect(result).toHaveProperty("0.availability.available", Available.no);
  });

  it("should set availability to NO if there are no slots", async () => {
    nock(API_BASE).get(API_MANIFEST_PATH).reply(200, fixtures.TestManifest);
    nock(API_BASE)
      .get("/fhir/locations.ndjson")
      .reply(200, toNdJson(fixtures.TestLocations));
    nock(API_BASE)
      .get("/fhir/schedules.ndjson")
      .reply(200, toNdJson(fixtures.TestSchedules));
    nock(API_BASE).get("/fhir/Slot-abc.ndjson").reply(200, "");

    const result = await checkAvailability(() => null, { states: "AK" });
    expect(result).toHaveProperty("0.availability.available", Available.no);
  });

  it("should not return results outside the requested states", async () => {
    nock(API_BASE).get(API_MANIFEST_PATH).reply(200, fixtures.TestManifest);
    nock(API_BASE)
      .get("/fhir/locations.ndjson")
      .reply(200, toNdJson(fixtures.TestLocations));
    nock(API_BASE)
      .get("/fhir/schedules.ndjson")
      .reply(200, toNdJson(fixtures.TestSchedules));
    nock(API_BASE)
      .get("/fhir/Slot-abc.ndjson")
      .reply(200, toNdJson(fixtures.TestSlots));

    const result = await checkAvailability(() => null, { states: "VA" });
    expect(result).toHaveLength(0);
  });
});
