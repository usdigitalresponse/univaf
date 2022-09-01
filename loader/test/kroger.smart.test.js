const nock = require("nock");
const { expectDatetimeString } = require("univaf-common/jest");
const { checkAvailability, API_URL } = require("../src/sources/kroger");
const { splitHostAndPath, toNdJson } = require("./support");
const { locationSchema } = require("./support/schemas");
const fixtures = require("./fixtures/kroger.smart.fixtures");
const { Available } = require("../src/model");

// Mock utils so we can track logs.
jest.mock("../src/utils");

describe("Kroger SMART Scheduling Links API", () => {
  const [API_BASE, MANIFEST_PATH] = splitHostAndPath(API_URL);

  it("should load Kroger SMART API data", async () => {
    nock(API_BASE).get(MANIFEST_PATH).reply(200, fixtures.TestManifest);
    nock(API_BASE)
      .get("/v1/health-wellness/schedules/vaccines/locations.ndjson")
      .reply(200, toNdJson(fixtures.TestLocations));
    nock(API_BASE)
      .get("/v1/health-wellness/schedules/vaccines/schedules.ndjson")
      .reply(200, toNdJson(fixtures.TestSchedules));
    nock(API_BASE)
      .get("/v1/health-wellness/schedules/vaccines/slot_AK.ndjson")
      .reply(200, toNdJson(fixtures.TestSlots));

    const result = await checkAvailability(() => null, { states: ["AK"] });
    expect(result).toEqual([
      {
        external_ids: [
          ["kroger", "70100011"],
          ["vtrcks", "40173465"],
          ["kroger_fred", "70100011"],
        ],

        location_type: "PHARMACY",
        provider: "kroger",
        name: "Fred Meyer Pharmacy #70100011",
        address_lines: ["1000 E Northern Lights Blvd"],
        city: "Anchorage",
        postal_code: "99508",
        state: "AK",
        info_phone: "9072649600",
        info_url: "https://www.fredmeyer.com/rx/landing-page",
        booking_url: "https://www.fredmeyer.com/rx/covid-eligibility",

        availability: {
          source: "univaf-kroger-smart",
          available: "YES",
          capacity: [
            {
              available: "YES",
              date: "2021-10-22",
            },
            {
              available: "NO",
              date: "2021-10-23",
            },
            {
              available: "NO",
              date: "2021-10-24",
            },
            {
              available: "YES",
              date: "2021-10-25",
            },
          ],
          checked_at: expectDatetimeString(),
          valid_at: "2021-10-22T00:00:02+00:00",
          is_public: true,
        },
      },
    ]);

    // Expect the `checked_at` time to be recent.
    const checkedDate = new Date(result[0].availability.checked_at);
    expect(Date.now() - checkedDate).toBeLessThan(1000);

    expect(result).toContainItemsMatchingSchema(locationSchema);
  });

  it("should set availability to NO if no slots are free", async () => {
    nock(API_BASE).get(MANIFEST_PATH).reply(200, fixtures.TestManifest);
    nock(API_BASE)
      .get("/v1/health-wellness/schedules/vaccines/locations.ndjson")
      .reply(200, toNdJson(fixtures.TestLocations));
    nock(API_BASE)
      .get("/v1/health-wellness/schedules/vaccines/schedules.ndjson")
      .reply(200, toNdJson(fixtures.TestSchedules));
    nock(API_BASE)
      .get("/v1/health-wellness/schedules/vaccines/slot_AK.ndjson")
      .reply(
        200,
        toNdJson(
          fixtures.TestSlots.map((slot) => ({ ...slot, status: "busy" }))
        )
      );

    const result = await checkAvailability(() => null, { states: ["AK"] });
    expect(result).toHaveProperty("0.availability.available", Available.no);
    expect(result).toContainItemsMatchingSchema(locationSchema);
  });

  it("should not return results outside the requested states", async () => {
    nock(API_BASE).get(MANIFEST_PATH).reply(200, fixtures.TestManifest);
    nock(API_BASE)
      .get("/v1/health-wellness/schedules/vaccines/locations.ndjson")
      .reply(200, toNdJson(fixtures.TestLocations));
    nock(API_BASE)
      .get("/v1/health-wellness/schedules/vaccines/schedules.ndjson")
      .reply(200, toNdJson(fixtures.TestSchedules));
    nock(API_BASE)
      .get("/v1/health-wellness/schedules/vaccines/slot_NJ.ndjson")
      .reply(200, toNdJson(fixtures.TestSlots));

    const result = await checkAvailability(() => null, { states: ["NJ"] });
    expect(result).toHaveLength(0);
  });

  // 99999 represents a non-real test location.
  it("should not include locations with ID 99999", async () => {
    nock(API_BASE).get(MANIFEST_PATH).reply(200, fixtures.TestManifest);
    nock(API_BASE)
      .get("/v1/health-wellness/schedules/vaccines/locations.ndjson")
      .reply(200, () => {
        const items = JSON.parse(JSON.stringify(fixtures.TestLocations));
        items[0].id = "99999";
        return toNdJson(items);
      });
    nock(API_BASE)
      .get("/v1/health-wellness/schedules/vaccines/schedules.ndjson")
      .reply(200, () => {
        const items = JSON.parse(JSON.stringify(fixtures.TestSchedules));
        items[0].id = "99999";
        items[0].actor[0].reference = "Location/99999";
        return toNdJson(items);
      });
    nock(API_BASE)
      .get("/v1/health-wellness/schedules/vaccines/slot_AK.ndjson")
      .reply(200, () => {
        const items = JSON.parse(JSON.stringify(fixtures.TestSlots)).map(
          (item) => {
            item.schedule.reference = "Schedule/99999";
            return item;
          }
        );
        return toNdJson(items);
      });

    const result = await checkAvailability(() => null, { states: ["AK"] });
    expect(result).toHaveLength(0);
  });
});
