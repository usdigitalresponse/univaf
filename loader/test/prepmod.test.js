const nock = require("nock");
const config = require("../src/config");
const {
  API_PATH,
  checkAvailability,
  formatLocation,
} = require("../src/sources/prepmod");
const { prepmodHostsByState } = require("../src/sources/prepmod/hosts");
const {
  createSmartLocation,
  createSmartManifest,
} = require("./support/smart-scheduling-links");
const { expectDatetimeString, toNdJson } = require("./support");
const { locationSchema } = require("./support/schemas");
const { VaccineProduct } = require("../src/model");
const { EXTENSIONS } = require("../src/smart-scheduling-links");

describe("PrepMod API", () => {
  jest.setTimeout(60000);

  const _apiUrl = config.apiUrl;
  const _apiKey = config.apiKey;
  afterEach(() => {
    config.apiUrl = _apiUrl;
    config.apiKey = _apiKey;

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
        booking_url:
          "https://prepmod.doh.wa.gov/appointment/en/clinic/search?location=99362&search_radius=10+miles&q%5Bvenue_search_name_or_venue_name_i_cont%5D=Walla+Walla+Mobile+Units",
        location_type: "CLINIC",
        name: "Walla Walla Mobile Units",
        position: {
          latitude: 46.0763689,
          longitude: -118.2838519,
        },
        postal_code: "99362",
        provider: "prepmod",
        state: "WA",
        is_public: true,
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
        booking_url:
          "https://prepmod.doh.wa.gov/appointment/en/clinic/search?location=98944&search_radius=10+miles&q%5Bvenue_search_name_or_venue_name_i_cont%5D=Yakima+County+Health+District+COVID+Vaccination+Site",
        location_type: "CLINIC",
        name: "Yakima County Health District COVID Vaccination Site",
        position: {
          latitude: 46.3244796,
          longitude: -119.994118,
        },
        postal_code: "98944",
        provider: "prepmod",
        state: "WA",
        is_public: true,
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
    expect(result).toContainItemsMatchingSchema(locationSchema);
  });

  it("identifies Pfizer for 5-11 year olds", async () => {
    const testLocation = createSmartLocation({
      schedules: [
        {
          extension: [
            {
              url: EXTENSIONS.PRODUCT,
              valueCoding: {
                system: "http://hl7.org/fhir/sid/cvx",
                code: null,
                display: "Pfizer Pediatric COVID-19 Vaccine (Ages 5-11)",
              },
            },
          ],
        },
      ],
    });

    const result = formatLocation(
      "https://myhealth.alaska.gov",
      new Date(),
      testLocation
    );
    expect(result).toHaveProperty("availability.slots.0.products", [
      VaccineProduct.pfizerAge5_11,
    ]);
  });

  it("identifies Pfizer for 2-4 year olds", async () => {
    const testLocation = createSmartLocation({
      schedules: [
        {
          extension: [
            {
              url: EXTENSIONS.PRODUCT,
              valueCoding: {
                system: "http://hl7.org/fhir/sid/cvx",
                code: null,
                display: "Pfizer Pediatric COVID-19 Vaccine (Ages 2-4)",
              },
            },
          ],
        },
      ],
    });

    const result = formatLocation(
      "https://myhealth.alaska.gov",
      new Date(),
      testLocation
    );
    expect(result).toHaveProperty("availability.slots.0.products", [
      VaccineProduct.pfizerAge2_4,
    ]);
  });

  it("identifies Pfizer for adults", async () => {
    const testLocation = createSmartLocation({
      schedules: [
        {
          extension: [
            {
              url: EXTENSIONS.PRODUCT,
              valueCoding: {
                system: "http://hl7.org/fhir/sid/cvx",
                code: null,
                display: "Pfizer-BioNTech COVID-19 Vaccine",
              },
            },
          ],
        },
      ],
    });

    const result = formatLocation(
      "https://myhealth.alaska.gov",
      new Date(),
      testLocation
    );
    expect(result).toHaveProperty("availability.slots.0.products", [
      VaccineProduct.pfizer,
    ]);
  });

  it("hides locations not in the API response when --hide-missing-locations is set", async () => {
    const testLocation = createSmartLocation({ id: "abc123" });
    // A UNIVAF-formatted location that matches the above SMART SL data.
    const testSavedLocation = {
      id: "saved-abc123",
      external_ids: [["prepmod-myhealth.alaska.gov-location", "abc123"]],
    };
    // A UNIVAF-formatted location that will be missing from the SMART SL data.
    const testMissingLocation = {
      id: "saved-def456",
      external_ids: [["prepmod-myhealth.alaska.gov-location", "def456"]],
    };

    // Mock the UNIVAF API returning both locations.
    config.apiUrl = "http://univaf.test";
    config.apiKey = "abc";
    nock(config.apiUrl)
      .get("/api/edge/locations")
      .query(true)
      .reply(200, {
        links: {},
        data: [testSavedLocation, testMissingLocation],
      });

    // Mock the PrepMod API returning only one of the locations.
    const apiHost = prepmodHostsByState.AK.state;
    nock(apiHost)
      .get(API_PATH)
      .reply(200, createSmartManifest(apiHost, API_PATH));
    nock(apiHost)
      .get("/test/locations.ndjson")
      .reply(200, toNdJson([testLocation.location]));
    nock(apiHost)
      .get("/test/schedules.ndjson")
      .reply(200, toNdJson(testLocation.schedules));
    nock(apiHost)
      .get("/test/slots.ndjson")
      .reply(200, toNdJson(testLocation.slots));

    const results = await checkAvailability(() => {}, {
      states: "AK",
      hideMissingLocations: true,
    });
    expect(results).toHaveLength(2);
    expect(results).toHaveProperty("0.is_public", true);
    expect(results).toHaveProperty("1.is_public", false);
  });
});
