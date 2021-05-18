const nock = require("nock");
const { URL } = require("url");
const {
  checkAvailability,
  CVS_SMART_API_URL,
} = require("../src/sources/cvs/smart");
const { expectDatetimeString } = require("./support");
const fixtures = require("./cvs.smart.fixtures");
const { Available } = require("../src/model");

function toNdJson(items) {
  return items
    .map((item) => JSON.stringify(item))
    .map((item) => `${item}\n`)
    .join("");
}

describe("CVS SMART Scheduling Links API", () => {
  const CVS_BASE = Object.assign(new URL(CVS_SMART_API_URL), {
    pathname: "",
  }).toString();
  const CVS_MANIFEST_PATH = new URL(CVS_SMART_API_URL).pathname;

  it("should load CVS SMART API data", async () => {
    nock(CVS_BASE).get(CVS_MANIFEST_PATH).reply(200, fixtures.TestManifest);
    nock(CVS_BASE)
      .get("/immunizations/inventory/data/location.ndjson")
      .reply(200, toNdJson(fixtures.TestLocations));
    nock(CVS_BASE)
      .get("/immunizations/inventory/data/schedule.ndjson")
      .reply(200, toNdJson(fixtures.TestSchedules));
    nock(CVS_BASE)
      .get("/immunizations/inventory/data/slot.ndjson")
      .reply(200, toNdJson(fixtures.TestSlots));

    const result = await checkAvailability(() => null, { states: "VA" });
    expect(result).toEqual([
      {
        id: "CVS:02004",
        external_ids: {
          cvs: "02004",
          vtrcks: "CV1002004",
        },

        location_type: "PHARMACY",
        provider: "CVS",
        name: "CVS #2004",
        address_lines: ["3117 LOCKHEED BLVD."],
        city: "ALEXANDRIA",
        postal_code: "22306",
        state: "VA",
        booking_phone: "888-607-4287",
        booking_url: "https://www.cvs.com/vaccine/intake/store/cvd-schedule",

        availability: {
          source: "univaf-cvs-smart",
          available: "YES",
          capacity: [
            {
              available: "NO",
              date: "2021-05-18",
            },
            {
              available: "YES",
              date: "2021-05-19",
            },
          ],
          checked_at: expectDatetimeString(),
          valid_at: "2021-05-17T16:41:05.534Z",
          is_public: true,
        },
      },
    ]);

    // Expect the `checked_at` time to be recent.
    const checkedDate = new Date(result[0].availability.checked_at);
    expect(Date.now() - checkedDate).toBeLessThan(1000);
  });

  it("should set availability to NO if no slots are free", async () => {
    nock(CVS_BASE).get(CVS_MANIFEST_PATH).reply(200, fixtures.TestManifest);
    nock(CVS_BASE)
      .get("/immunizations/inventory/data/location.ndjson")
      .reply(200, toNdJson(fixtures.TestLocations));
    nock(CVS_BASE)
      .get("/immunizations/inventory/data/schedule.ndjson")
      .reply(200, toNdJson(fixtures.TestSchedules));
    nock(CVS_BASE)
      .get("/immunizations/inventory/data/slot.ndjson")
      .reply(
        200,
        toNdJson(
          fixtures.TestSlots.map((slot) => ({ ...slot, status: "busy" }))
        )
      );

    const result = await checkAvailability(() => null, { states: "VA" });
    expect(result).toHaveProperty("0.availability.available", Available.no);
  });

  it("should not return results outside the requested states", async () => {
    nock(CVS_BASE).get(CVS_MANIFEST_PATH).reply(200, fixtures.TestManifest);
    nock(CVS_BASE)
      .get("/immunizations/inventory/data/location.ndjson")
      .reply(200, toNdJson(fixtures.TestLocations));
    nock(CVS_BASE)
      .get("/immunizations/inventory/data/schedule.ndjson")
      .reply(200, toNdJson(fixtures.TestSchedules));
    nock(CVS_BASE)
      .get("/immunizations/inventory/data/slot.ndjson")
      .reply(200, toNdJson(fixtures.TestSlots));

    const result = await checkAvailability(() => null, { states: "NJ" });
    expect(result).toHaveLength(0);
  });
});
