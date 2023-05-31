const nock = require("nock");
const { Available } = require("../src/model");
const { checkAvailability, API_URL } = require("../src/sources/riteaid/smart");
const {
  expectDatetimeString,
  splitHostAndPath,
  toNdJson,
} = require("./support");
const { locationSchema } = require("./support/schemas");
const { createSmartLocation } = require("./support/smart-scheduling-links");

jest.mock("../src/logging");

const [API_BASE, API_MANIFEST_PATH] = splitHostAndPath(API_URL);

const mockManifest = {
  transactionTime: "2021-05-17T16:41:05.534Z",
  request: `${API_BASE}${API_MANIFEST_PATH}`,
  output: [
    { type: "Location", url: `${API_BASE}locations/NJ.ndjson` },
    { type: "Schedule", url: `${API_BASE}schedules/NJ.ndjson` },
    {
      type: "Slot",
      url: `${API_BASE}slots/NJ.ndjson`,
      extension: { state: "NJ" },
    },
    { type: "Location", url: `${API_BASE}locations/MA.ndjson` },
    { type: "Schedule", url: `${API_BASE}schedules/MA.ndjson` },
    {
      type: "Slot",
      url: `${API_BASE}slots/MA.ndjson`,
      extension: { state: "MA" },
    },
  ],
  error: [],
};

const {
  location: mockLocation,
  schedules: mockSchedules,
  slots: mockSlots,
} = createSmartLocation({
  id: "1234",
  identifier: [
    {
      system: "https://cdc.gov/vaccines/programs/vtrcks",
      value: "RA101234",
    },
  ],
  address: {
    line: ["123 Example Rd."],
    city: "Somewheresville",
    state: "NJ",
    postalCode: "08022",
  },
  schedules: [
    {
      slots: [
        {
          start: "2021-09-13T09:00:00.000-08:00",
          end: "2021-09-13T16:00:00.000-08:00",
          extension: [
            {
              url: "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-deep-link",
              valueUrl: "https://riteaid.com/appointment/",
            },
            {
              url: "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-phone",
              valueString: "(302) 653-6649",
            },
          ],
        },
        {
          start: "2021-09-14T09:00:00.000-08:00",
          end: "2021-09-14T16:00:00.000-08:00",
          extension: [
            {
              url: "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-deep-link",
              valueUrl: "https://riteaid.com/appointment/",
            },
            {
              url: "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-phone",
              valueString: "(302) 653-6649",
            },
          ],
        },
      ],
    },
  ],
});

afterEach(() => {
  nock.cleanAll();
});

describe("Rite Aid SMART Scheduling Links API", () => {
  it.nock("should output valid data", async () => {
    const result = await checkAvailability(() => {}, { states: ["NJ"] });
    expect(result).toContainItemsMatchingSchema(locationSchema);
  });

  it("should load Rite Aid SMART API data", async () => {
    nock(API_BASE).get(API_MANIFEST_PATH).reply(200, mockManifest);
    nock(API_BASE)
      .get("/locations/NJ.ndjson")
      .reply(200, toNdJson([mockLocation]));
    nock(API_BASE)
      .get("/schedules/NJ.ndjson")
      .reply(200, toNdJson(mockSchedules));
    nock(API_BASE).get("/slots/NJ.ndjson").reply(200, toNdJson(mockSlots));

    const result = await checkAvailability(() => null, { states: ["NJ"] });
    expect(result).toEqual([
      {
        external_ids: [
          ["vtrcks", "RA101234"],
          ["rite_aid", "1234"],
        ],
        location_type: "PHARMACY",
        provider: "rite_aid",
        name: "Rite Aid #1234",
        address_lines: ["123 Example Rd."],
        city: "Somewheresville",
        postal_code: "08022",
        state: "NJ",
        position: {
          latitude: 46.0763689,
          longitude: -118.2838519,
        },

        info_phone: "888-555-1234",
        info_url: "https://example.com/1234",
        booking_phone: "(302) 653-6649",
        booking_url: "https://riteaid.com/appointment/",

        availability: {
          source: "univaf-rite-aid-smart",
          available: "YES",
          checked_at: expectDatetimeString(),
          is_public: true,
          capacity: [
            {
              available: Available.yes,
              date: "2021-09-13",
              booking_url: "https://riteaid.com/appointment/",
            },
            {
              available: Available.yes,
              date: "2021-09-14",
              booking_url: "https://riteaid.com/appointment/",
            },
          ],
        },
      },
    ]);

    // Expect the `checked_at` time to be recent.
    const checkedDate = new Date(result[0].availability.checked_at);
    expect(Date.now() - checkedDate).toBeLessThan(1000);

    expect(result).toContainItemsMatchingSchema(locationSchema);
    expect(nock.isDone()).toBe(true);
  });

  it("should set availability to NO if no slots are free", async () => {
    nock(API_BASE).get(API_MANIFEST_PATH).reply(200, mockManifest);
    nock(API_BASE)
      .get("/locations/NJ.ndjson")
      .reply(200, toNdJson([mockLocation]));
    nock(API_BASE)
      .get("/schedules/NJ.ndjson")
      .reply(200, toNdJson(mockSchedules));
    nock(API_BASE)
      .get("/slots/NJ.ndjson")
      .reply(
        200,
        toNdJson(mockSlots.map((slot) => ({ ...slot, status: "busy" })))
      );

    const result = await checkAvailability(() => null, { states: ["NJ"] });
    expect(result).toHaveProperty("0.availability.available", Available.no);
    expect(result).toContainItemsMatchingSchema(locationSchema);
    expect(nock.isDone()).toBe(true);
  });

  it("should set availability to NO if there are no slots", async () => {
    nock(API_BASE).get(API_MANIFEST_PATH).reply(200, mockManifest);
    nock(API_BASE)
      .get("/locations/NJ.ndjson")
      .reply(200, toNdJson([mockLocation]));
    nock(API_BASE)
      .get("/schedules/NJ.ndjson")
      .reply(200, toNdJson(mockSchedules));
    nock(API_BASE).get("/slots/NJ.ndjson").reply(200, "");

    const result = await checkAvailability(() => null, { states: ["NJ"] });
    expect(result).toHaveProperty("0.availability.available", Available.no);
    expect(result).toContainItemsMatchingSchema(locationSchema);
    expect(nock.isDone()).toBe(true);
  });

  it("should not return results outside the requested states", async () => {
    nock(API_BASE).get(API_MANIFEST_PATH).reply(200, mockManifest);

    const result = await checkAvailability(() => null, { states: ["VA"] });
    expect(result).toHaveLength(0);

    // It should not have *requested* extra states, either! This tests that
    // the state was correctly inferred, since the manifest does not specify
    // them for locations.
    expect(nock.isDone()).toBe(true);
  });
});
