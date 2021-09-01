const nock = require("nock");
const { checkAvailability } = require("../src/sources/prepmod");
const { expectDatetimeString } = require("./support");

describe("PrepMod API", () => {
  jest.setTimeout(60000);

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  // TODO: this it.nock test should just check formatting, and we should
  // have tests with simpler, more contrived API responses to verify values.
  // This is too complicated to set up again if the API changes.
  it.nock("should successfully format results", async () => {
    const result = await checkAvailability(() => {}, { states: "WA" });
    expect(result).toEqual([
      {
        address_lines: ["500 Tausick Way"],
        city: "Walla Walla",
        county: "Walla Walla",
        external_ids: [
          [
            "prepmod-prepmod.doh.wa.gov-location",
            "a475ff88d4e0bb9ee1fc09040d45f5cb",
          ],
          ["prepmod-prepmod.doh.wa.gov-clinic", "6320"],
        ],
        info_phone: "509-730-3669",
        info_url: "https://prepmod.doh.wa.gov//?locale=en",
        location_type: "CLINIC",
        name: "Walla Walla Mobile Units",
        position: {
          latitude: 46.0763689,
          longitude: -118.2838519,
        },
        postal_code: "99362",
        provider: "prepmod",
        state: "WA",

        availability: {
          available: "YES",
          checked_at: expectDatetimeString(),
          is_public: true,
          source: "univaf-prepmod",
          valid_at: "2021-09-01T21:56:12+00:00",
          slots: [
            {
              available: "YES",
              available_count: 4,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=6320",
              dose: undefined,
              end: "2021-09-13T09:09:00.000-08:00",
              products: ["jj", "pfizer"],
              start: "2021-09-13T09:00:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 4,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=6320",
              dose: undefined,
              end: "2021-09-13T09:18:00.000-08:00",
              products: ["jj", "pfizer"],
              start: "2021-09-13T09:09:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 4,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=6320",
              dose: undefined,
              end: "2021-09-13T09:27:00.000-08:00",
              products: ["jj", "pfizer"],
              start: "2021-09-13T09:18:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 4,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=6320",
              dose: undefined,
              end: "2021-09-13T09:36:00.000-08:00",
              products: ["jj", "pfizer"],
              start: "2021-09-13T09:27:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 3,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=6320",
              dose: undefined,
              end: "2021-09-13T09:45:00.000-08:00",
              products: ["jj", "pfizer"],
              start: "2021-09-13T09:36:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 4,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=6320",
              dose: undefined,
              end: "2021-09-13T09:54:00.000-08:00",
              products: ["jj", "pfizer"],
              start: "2021-09-13T09:45:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 4,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=6320",
              dose: undefined,
              end: "2021-09-13T10:03:00.000-08:00",
              products: ["jj", "pfizer"],
              start: "2021-09-13T09:54:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 4,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=6320",
              dose: undefined,
              end: "2021-09-13T10:12:00.000-08:00",
              products: ["jj", "pfizer"],
              start: "2021-09-13T10:03:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 4,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=6320",
              dose: undefined,
              end: "2021-09-13T10:21:00.000-08:00",
              products: ["jj", "pfizer"],
              start: "2021-09-13T10:12:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 4,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=6320",
              dose: undefined,
              end: "2021-09-13T10:30:00.000-08:00",
              products: ["jj", "pfizer"],
              start: "2021-09-13T10:21:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 4,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=6320",
              dose: undefined,
              end: "2021-09-13T10:39:00.000-08:00",
              products: ["jj", "pfizer"],
              start: "2021-09-13T10:30:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 4,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=6320",
              dose: undefined,
              end: "2021-09-13T10:48:00.000-08:00",
              products: ["jj", "pfizer"],
              start: "2021-09-13T10:39:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 4,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=6320",
              dose: undefined,
              end: "2021-09-13T10:57:00.000-08:00",
              products: ["jj", "pfizer"],
              start: "2021-09-13T10:48:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 3,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=6320",
              dose: undefined,
              end: "2021-09-13T11:06:00.000-08:00",
              products: ["jj", "pfizer"],
              start: "2021-09-13T10:57:00.000-08:00",
            },
          ],
        },
      },
      {
        address_lines: ["2010 Yakima Valley Highway"],
        city: "Sunnyside",
        county: "Yakima",
        external_ids: [
          [
            "prepmod-prepmod.doh.wa.gov-location",
            "a23fd81af085c8a37c707b7ba929a78f",
          ],
          ["prepmod-prepmod.doh.wa.gov-clinic", "7889"],
          ["prepmod-prepmod.doh.wa.gov-clinic", "7898"],
        ],
        info_phone: undefined,
        info_url: "https://prepmod.doh.wa.gov//?locale=en",
        location_type: "CLINIC",
        name: "Yakima County Health District COVID Vaccination Site",
        position: {
          latitude: 46.3244796,
          longitude: -119.994118,
        },
        postal_code: "98944",
        provider: "prepmod",
        state: "WA",
        availability: {
          available: "YES",
          checked_at: expectDatetimeString(),
          is_public: true,
          slots: [
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T09:20:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T09:00:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T09:40:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T09:20:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T10:00:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T09:40:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T10:20:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T10:00:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T10:40:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T10:20:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T11:00:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T10:40:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T11:20:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T11:00:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T11:40:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T11:20:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T12:00:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T11:40:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T12:20:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T12:00:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T12:40:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T12:20:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T13:00:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T12:40:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T13:20:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T13:00:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T13:40:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T13:20:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T14:00:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T13:40:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T14:20:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T14:00:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T14:40:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T14:20:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T15:00:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T14:40:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T15:20:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T15:00:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T15:40:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T15:20:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 5,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7889",
              dose: undefined,
              end: "2021-09-05T16:00:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-05T15:40:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 7,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7898",
              dose: undefined,
              end: "2021-09-08T14:20:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-08T14:00:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 7,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7898",
              dose: undefined,
              end: "2021-09-08T14:40:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-08T14:20:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 7,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7898",
              dose: undefined,
              end: "2021-09-08T15:00:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-08T14:40:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 7,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7898",
              dose: undefined,
              end: "2021-09-08T15:20:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-08T15:00:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 7,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7898",
              dose: undefined,
              end: "2021-09-08T15:40:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-08T15:20:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 7,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7898",
              dose: undefined,
              end: "2021-09-08T16:00:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-08T15:40:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 7,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7898",
              dose: undefined,
              end: "2021-09-08T16:20:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-08T16:00:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 7,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7898",
              dose: undefined,
              end: "2021-09-08T16:40:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-08T16:20:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 7,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7898",
              dose: undefined,
              end: "2021-09-08T17:00:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-08T16:40:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 7,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7898",
              dose: undefined,
              end: "2021-09-08T17:20:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-08T17:00:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 7,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7898",
              dose: undefined,
              end: "2021-09-08T17:40:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-08T17:20:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 7,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7898",
              dose: undefined,
              end: "2021-09-08T18:00:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-08T17:40:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 7,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7898",
              dose: undefined,
              end: "2021-09-08T18:20:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-08T18:00:00.000-08:00",
            },
            {
              available: "YES",
              available_count: 7,
              booking_url:
                "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=7898",
              dose: undefined,
              end: "2021-09-08T18:40:00.000-08:00",
              products: ["pfizer"],
              start: "2021-09-08T18:20:00.000-08:00",
            },
          ],
          source: "univaf-prepmod",
          valid_at: "2021-09-01T21:56:12+00:00",
        },
      },
    ]);
  });
});
