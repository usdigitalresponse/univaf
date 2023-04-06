const { DateTime } = require("luxon");
const nock = require("nock");
const utils = require("../src/utils");
const {
  checkAvailability,
  queryState,
  formatStore,
} = require("../src/sources/riteaid/api");
const { locationSchema } = require("./support/schemas");
const responseFixture = require("./fixtures/riteaid.api.test.json");

// Mock utils so we can track logs.
jest.mock("../src/utils");

function createMockApiLocation() {
  return {
    ...responseFixture.Data.providerDetails[0],
    last_updated: DateTime.utc().toFormat("yyyy/MM/dd HH:mm:ss"),
  };
}

describe("Rite Aid Source", () => {
  const API_URL = "https://api.riteaid.com/test";
  let processMock;

  beforeEach(() => {
    processMock = jest.replaceProperty(process, "env", {
      RITE_AID_URL: API_URL,
      RITE_AID_KEY: "test",
    });
  });

  afterEach(() => {
    processMock.restore();
    utils.__mockClear();
    nock.cleanAll();
  });

  it("throws on failing API response", async () => {
    nock(API_URL).get("?stateCode=NJ").reply(200, {
      Status: "ERROR",
      ErrCde: "1234",
      ErrMsg: "RiteAid API timed out",
      ErrMsgDtl: "Timed out because things are pretty crazy over here!",
    });

    await expect(queryState("NJ")).rejects.toThrow("API timed out");
  });

  it("processes response correctly", async () => {
    // Set last_updated to a current time, rounded to the second.
    const timestamp = Math.floor(Date.now() / 1000);
    const now = DateTime.fromSeconds(timestamp, { zone: "UTC" });
    const riteAidTime = now.toFormat("yyyy/MM/dd HH:mm:ss");
    for (const record of responseFixture.Data.providerDetails) {
      record.last_updated = riteAidTime;
    }

    nock(API_URL).get("?stateCode=NJ").reply(200, responseFixture);

    const locations = await checkAvailability(() => {}, { states: ["NJ"] });
    expect(locations.length).toBe(108);

    expect(locations[0]).toStrictEqual({
      external_ids: [["rite_aid", "116"]],
      location_type: "PHARMACY",
      name: "Rite Aid #116",
      provider: "rite_aid",
      address_lines: ["907 North High Street"],
      city: "Millville",
      state: "NJ",
      postal_code: "08332-3762",
      county: "Cumberland",
      info_phone: "(856) 825-7742",
      info_url: "https://www.riteaid.com/covid-19",
      booking_phone: "(856) 825-7742",
      booking_url: "https://www.riteaid.com/pharmacy/covid-qualifier",
      availability: {
        source: "univaf-rite-aid-api",
        checked_at: locations[0].availability.checked_at,
        valid_at: now.toISO(),
        available: "YES",
        capacity: [
          {
            available: "YES",
            available_count: 8,
            date: "2021-04-23",
            unavailable_count: 192,
          },
          {
            available: "YES",
            available_count: 21,
            date: "2021-04-24",
            unavailable_count: 179,
          },
          {
            available: "NO",
            available_count: 0,
            date: "2021-04-25",
            unavailable_count: 0,
          },
          {
            available: "NO",
            available_count: 0,
            date: "2021-04-26",
            unavailable_count: 0,
          },
          {
            available: "YES",
            available_count: 21,
            date: "2021-04-27",
            unavailable_count: 179,
          },
          {
            available: "YES",
            available_count: 23,
            date: "2021-04-28",
            unavailable_count: 177,
          },
          {
            available: "YES",
            available_count: 34,
            date: "2021-04-29",
            unavailable_count: 166,
          },
          {
            available: "YES",
            available_count: 36,
            date: "2021-04-30",
            unavailable_count: 164,
          },
          {
            available: "YES",
            available_count: 37,
            date: "2021-05-01",
            unavailable_count: 163,
          },
          {
            available: "NO",
            available_count: 0,
            date: "2021-05-02",
            unavailable_count: 0,
          },
          {
            available: "NO",
            available_count: 0,
            date: "2021-05-03",
            unavailable_count: 0,
          },
          {
            available: "YES",
            available_count: 183,
            date: "2021-05-04",
            unavailable_count: 17,
          },
          {
            available: "YES",
            available_count: 179,
            date: "2021-05-05",
            unavailable_count: 21,
          },
          {
            available: "YES",
            available_count: 185,
            date: "2021-05-06",
            unavailable_count: 15,
          },
          {
            available: "YES",
            available_count: 171,
            date: "2021-05-07",
            unavailable_count: 29,
          },
          {
            available: "YES",
            available_count: 167,
            date: "2021-05-08",
            unavailable_count: 33,
          },
          {
            available: "NO",
            available_count: 0,
            date: "2021-05-09",
            unavailable_count: 0,
          },
          {
            available: "NO",
            available_count: 0,
            date: "2021-05-10",
            unavailable_count: 0,
          },
          {
            available: "YES",
            available_count: 13,
            date: "2021-05-11",
            unavailable_count: 187,
          },
        ],
      },
    });

    expect(locations).toContainItemsMatchingSchema(locationSchema);
  });

  it("throws errors for inconsistent slot counts", async () => {
    const badData = {
      ...createMockApiLocation(),
      availability: [
        {
          date: "2021-04-23",
          total_slots: 200,
          available_slots: 8,
        },
        {
          date: "2021-04-24",
          total_slots: 200,
          available_slots: 201,
        },
      ],
    };

    expect(() => formatStore(badData)).toThrow(/slots/);
  });

  it("warns for unreasonable slot counts", async () => {
    const badData = {
      ...createMockApiLocation(),
      availability: [
        {
          date: "2021-04-23",
          total_slots: 200,
          available_slots: 8,
        },
        {
          date: "2021-04-24",
          total_slots: 1000,
          available_slots: 10,
        },
      ],
    };

    formatStore(badData);
    expect(utils.__getWarnings()).toContainEqual(
      expect.stringContaining("slot count")
    );
  });

  it("includes sub-brand IDs when appropriate", () => {
    const rawData = {
      ...createMockApiLocation(),
      id: 6958,
    };

    const formatted = formatStore(rawData);
    expect(formatted).toHaveProperty("external_ids", [
      ["rite_aid", "6958"],
      ["bartell", "58"],
    ]);
    expect(formatted).toHaveProperty("name", "Bartell Drugs #58");
  });
});
