const nock = require("nock");
const { Available } = require("../src/model");
const {
  API_URL,
  checkAvailability,
} = require("../src/sources/riteaid/scraper");
const { expectDatetimeString, splitHostAndPath } = require("./support");
const { locationSchema } = require("./support/schemas");

// Mock utils so we can track logs.
jest.mock("../src/utils");

const [API_URL_BASE, API_URL_PATH] = splitHostAndPath(API_URL);

const basicLocation = {
  storeNumber: 3455,
  brand: "UNKNOWN",
  customDisplayName: "UNKNOWN",
  address: "1426 Mt. Ephraim Avenue",
  city: "Camden",
  state: "NJ",
  zipcode: "8104",
  timeZone: "EST",
  fullZipCode: "8104-1549",
  fullPhone: "(856) 541-7648",
  locationDescription:
    "Located at 1426 Mt. Ephraim Avenue At The Corner Of Atlantic And Mt Ephraim Ave",
  storeType: "CORE",
  latitude: 39.9295,
  longitude: -75.1076,
  name: "Rite Aid",
  milesFromCenter: 0.43,
  specialServiceKeys: ["PREF-100", "PREF-101", "PREF-102", "PREF-103"],
  totalAvailableSlots: 0,
  availableSlots: [],
};

describe("Rite Aid Scraper", () => {
  jest.setTimeout(20_000);

  afterEach(() => {
    nock.cleanAll();
  });

  it.nock("should output valid data", async () => {
    const result = await checkAvailability(() => {}, {
      states: "NJ",
      rateLimit: 0,
    });
    expect(result).toContainItemsMatchingSchema(locationSchema);
  });

  it("correctly formats data", async () => {
    nock(API_URL_BASE)
      .get(API_URL_PATH)
      .query(true)
      .reply(200, {
        Status: "SUCCESS",
        data: {
          stores: [
            {
              ...basicLocation,
              totalSlotCount: 50,
              firstAvailableSlot: "2021-11-23T17:00:00",
              totalAvailableSlots: 0,
              availableSlots: [],
            },
          ],
        },
      });
    nock(API_URL_BASE)
      .get(API_URL_PATH)
      .query((query) => query.storeNumbers === `${basicLocation.storeNumber}`)
      .reply(200, {
        Status: "SUCCESS",
        data: {
          stores: [
            {
              ...basicLocation,
              totalSlotCount: 0,
              firstAvailableSlot: null,
              totalAvailableSlots: 5,
              availableSlots: [
                {
                  date: "2021-11-23",
                  available_slots: 1,
                  slots: {
                    9: [
                      {
                        appointmentId: "64271018",
                        apptDateTime: "2021-11-23T17:00:00",
                      },
                    ],
                    11: [
                      {
                        appointmentId: "64271018",
                        apptDateTime: "2021-11-23T17:00:00",
                      },
                    ],
                    13: [],
                    47: [],
                  },
                },
                {
                  date: "2021-11-24",
                  available_slots: 4,
                  slots: {
                    9: [
                      {
                        appointmentId: "21189068",
                        apptDateTime: "2021-11-24T09:20:00",
                      },
                      {
                        appointmentId: "21189069",
                        apptDateTime: "2021-11-24T09:40:00",
                      },
                    ],
                    11: [
                      {
                        appointmentId: "21189068",
                        apptDateTime: "2021-11-24T09:20:00",
                      },
                      {
                        appointmentId: "21189070",
                        apptDateTime: "2021-11-24T10:00:00",
                      },
                    ],
                    13: [
                      {
                        appointmentId: "21189071",
                        apptDateTime: "2021-11-24T10:20:00",
                      },
                    ],
                    47: [
                      {
                        appointmentId: "21189071",
                        apptDateTime: "2021-11-24T10:20:00",
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      });

    const result = await checkAvailability(() => {}, { states: "NJ" });
    expect(result).toContainItemsMatchingSchema(locationSchema);
    expect(result).toEqual([
      {
        location_type: "PHARMACY",
        name: "Rite Aid #3455",
        provider: "rite_aid",
        external_ids: [["rite_aid", "3455"]],
        address_lines: ["1426 Mt. Ephraim Avenue"],
        city: "Camden",
        state: "NJ",
        postal_code: "08104",
        position: {
          latitude: 39.9295,
          longitude: -75.1076,
        },
        description:
          "Located at 1426 Mt. Ephraim Avenue At The Corner Of Atlantic And Mt Ephraim Ave",
        info_phone: "(856) 541-7648",
        booking_url: "https://www.riteaid.com/pharmacy/covid-qualifier",
        meta: {},
        availability: {
          source: "univaf-rite-aid-scraper",
          available: "YES",
          checked_at: expectDatetimeString(),
          slots: [
            {
              start: "2021-11-23T17:00:00-05:00",
              available: "YES",
              products: ["moderna", "pfizer"],
            },
            {
              start: "2021-11-24T09:20:00-05:00",
              available: "YES",
              products: ["moderna", "pfizer"],
            },
            {
              start: "2021-11-24T09:40:00-05:00",
              available: "YES",
              products: ["moderna"],
            },
            {
              start: "2021-11-24T10:00:00-05:00",
              available: "YES",
              products: ["pfizer"],
            },
            {
              start: "2021-11-24T10:20:00-05:00",
              available: "YES",
              products: ["jj", "pfizer_age_5_11"],
            },
          ],
        },
      },
    ]);
  });

  it("handles duplicate dates in the data's slot lists", async () => {
    nock(API_URL_BASE)
      .get(API_URL_PATH)
      .query(true)
      .reply(200, {
        Status: "SUCCESS",
        data: {
          stores: [
            {
              ...basicLocation,
              totalSlotCount: 2,
              firstAvailableSlot: "2021-11-23T17:00:00",
              totalAvailableSlots: 0,
              availableSlots: [],
            },
          ],
        },
      });
    nock(API_URL_BASE)
      .get(API_URL_PATH)
      .query((query) => query.storeNumbers === `${basicLocation.storeNumber}`)
      .reply(200, {
        Status: "SUCCESS",
        data: {
          stores: [
            {
              ...basicLocation,
              totalSlotCount: 0,
              firstAvailableSlot: null,
              totalAvailableSlots: 2,
              availableSlots: [
                {
                  date: "2021-11-23",
                  available_slots: 2,
                  slots: {
                    9: [
                      {
                        appointmentId: "64271018",
                        apptDateTime: "2021-11-23T17:00:00",
                      },
                      {
                        appointmentId: "64271019",
                        apptDateTime: "2021-11-23T17:30:00",
                      },
                    ],
                    11: [
                      {
                        appointmentId: "64271018",
                        apptDateTime: "2021-11-23T17:00:00",
                      },
                    ],
                    13: [],
                    47: [],
                  },
                },
                {
                  date: "2021-11-23",
                  available_slots: 2,
                  slots: {
                    9: [
                      {
                        appointmentId: "64271018",
                        apptDateTime: "2021-11-23T17:00:00",
                      },
                      {
                        appointmentId: "64271019",
                        apptDateTime: "2021-11-23T17:30:00",
                      },
                    ],
                    11: [
                      {
                        appointmentId: "64271018",
                        apptDateTime: "2021-11-23T17:00:00",
                      },
                    ],
                    13: [],
                    47: [],
                  },
                },
              ],
            },
          ],
        },
      });

    const result = await checkAvailability(() => {}, { states: "NJ" });
    expect(result).toContainItemsMatchingSchema(locationSchema);
    expect(result[0].availability.slots).toEqual([
      {
        start: "2021-11-23T17:00:00-05:00",
        available: "YES",
        products: ["moderna", "pfizer"],
      },
      {
        start: "2021-11-23T17:30:00-05:00",
        available: "YES",
        products: ["moderna"],
      },
    ]);
  });

  it("identifies locations with no slots as not available", async () => {
    nock(API_URL_BASE)
      .get(API_URL_PATH)
      .query(true)
      .reply(200, {
        Status: "SUCCESS",
        data: {
          stores: [
            {
              ...basicLocation,
              totalSlotCount: 50,
              firstAvailableSlot: null,
              totalAvailableSlots: 0,
              availableSlots: [],
            },
          ],
        },
      });
    nock(API_URL_BASE)
      .get(API_URL_PATH)
      .query((query) => query.storeNumbers === `${basicLocation.storeNumber}`)
      .reply(200, {
        Status: "SUCCESS",
        data: {
          stores: [
            {
              ...basicLocation,
              totalSlotCount: 50,
              firstAvailableSlot: null,
              totalAvailableSlots: 0,
              availableSlots: [],
            },
          ],
        },
      });

    const result = await checkAvailability(() => {}, { states: "NJ" });
    expect(result).toContainItemsMatchingSchema(locationSchema);
    expect(result).toHaveProperty("0.availability.available", Available.no);
  });

  it("raises RiteAidApiError on API error responses", async () => {
    nock(API_URL_BASE).get(API_URL_PATH).query(true).reply(200, {
      Data: null,
      Status: "ERROR",
      ErrCde: "RA0005",
      ErrMsg: "Something went wrong. Please contact Customer Care to continue.",
      ErrMsgDtl: null,
    });

    await expect(checkAvailability(() => {}, { states: "NJ" })).rejects.toThrow(
      "Something went wrong"
    );
  });

  it("includes sub-brand IDs when appropriate", async () => {
    nock(API_URL_BASE)
      .get(API_URL_PATH)
      .query(true)
      .reply(200, {
        Status: "SUCCESS",
        data: {
          stores: [
            {
              ...basicLocation,
              storeNumber: 6958,
              totalSlotCount: 50,
              firstAvailableSlot: null,
            },
          ],
        },
      });
    nock(API_URL_BASE)
      .get(API_URL_PATH)
      .query((query) => query.storeNumbers === "6958")
      .reply(200, {
        Status: "SUCCESS",
        data: {
          stores: [
            {
              ...basicLocation,
              storeNumber: 6958,
              totalSlotCount: 50,
              firstAvailableSlot: null,
            },
          ],
        },
      });

    const result = await checkAvailability(() => {}, { states: "NJ" });
    expect(result).toHaveProperty("0.external_ids", [
      ["rite_aid", "6958"],
      ["bartell", "58"],
    ]);
  });
});
