const nock = require("nock");
const { checkAvailability, queryState } = require("../src/sources/riteaid/api");

describe("Rite Aid Source", () => {
  const API_URL = "https://api.riteaid.com/test";

  let _env = {};
  beforeEach(() => {
    _env = Object.assign({}, process.env);
    process.env.RITE_AID_URL = API_URL;
    process.env.RITE_AID_KEY = "test";
  });

  afterEach(() => {
    Object.assign(process.env, _env);
    nock.cleanAll();
  });

  it("throws on failing API response", async () => {
    nock(API_URL).get("?stateCode=NJ").reply(500, {
      Status: "ERROR",
      ErrCde: "1234",
      ErrMsg: "RiteAid API timed out",
      ErrMsgDtl: "Timed out because things are pretty crazy over here!",
    });

    await expect(queryState("NJ")).rejects.toThrow();
  });

  it("processes response correctly", async () => {
    const apiResponse = require("./fixtures/riteaid.api.test.json");
    nock(API_URL).get("?stateCode=NJ").reply(200, apiResponse);

    const locations = await queryState("NJ");
    expect(locations.length).toBe(108);

    expect(locations[0]).toStrictEqual({
      id: "rite_aid:116",
      external_ids: {
        rite_aid: "116",
      },
      location_type: "PHARMACY",
      name: "Rite Aid #116",
      provider: "rite_aid",
      address_lines: ["907 North High Street"],
      city: "Millville",
      state: "NJ",
      postal_code: "08332-3762",
      county: "Cumberland",
      position: null,
      info_phone: "(856) 825-7742",
      info_url: "https://www.riteaid.com/covid-19",
      booking_phone: "(856) 825-7742",
      booking_url: "https://www.riteaid.com/pharmacy/covid-qualifier",
      availability: {
        available: "YES",
        checked_at: locations[0].availability.checked_at,
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
        source: "univaf-rite-aid-api",
        valid_at: "2021-04-23T14:52:05.000Z",
      },
    });

    for (let location of locations) {
      expect(location.availability.checked_at).not.toBeUndefined();
    }
  });

  it("does not attempt to load states without Rite Aid stores", async () => {
    nock(API_URL).get("?stateCode=AK").reply(403, "uhoh");
    const results = await checkAvailability(() => {}, { states: "AK" });
    expect(results).toHaveLength(0);
  });
});
