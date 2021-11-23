const nock = require("nock");
const { API_URL, checkAvailability } = require("../src/sources/albertsons");
const { Available } = require("../src/model");
const { expectDatetimeString, splitHostAndPath } = require("./support");
const { locationSchema } = require("./support/schemas");

const [API_URL_BASE, API_URL_PATH] = splitHostAndPath(API_URL);

describe("Albertsons", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it.nock("should output valid data", { ignoreQuery: ["v"] }, async () => {
    const result = await checkAvailability(() => {}, { states: "AK" });
    expect(result).toContainItemsMatchingSchema(locationSchema);
  });

  it("should successfully format results", async () => {
    nock(API_URL_BASE)
      .get(API_URL_PATH)
      .query(true)
      .reply(
        200,
        [
          {
            id: "1600116808972",
            region: "Alaska",
            address: "Safeway 3410 - 30 College Rd, Fairbanks, AK, 99701",
            lat: "64.8515679",
            long: "-147.7024008",
            coach_url: "https://kordinator.mhealthcoach.net/vcl/1600116808972",
            availability: "no",
            drugName: ["Moderna"],
          },
          {
            id: "1600114849843",
            region: "Alaska",
            address: "Carrs 1813 - 1501 Huffman Road, Anchorage, AK, 99515",
            lat: "61.1096597",
            long: "-149.8559918",
            coach_url: "https://kordinator.mhealthcoach.net/vcl/1600114849843",
            availability: "yes",
            drugName: ["Pfizer", "Moderna"],
          },
        ],
        { "Last-Modified": "Thu, 28 Oct 2021 07:06:13 GMT" }
      );

    const result = await checkAvailability(() => {}, { states: "AK" });
    expect(result).toContainItemsMatchingSchema(locationSchema);
    expect(result).toEqual([
      {
        name: "Safeway 3410",
        external_ids: [
          ["albertsons", "1600116808972"],
          ["albertsons_safeway", "1600116808972"],
          ["safeway", "3410"],
          ["albertsons_store_number", "safeway:3410"],
        ],
        location_type: "PHARMACY",
        provider: "albertsons",
        address_lines: ["30 College Rd"],
        city: "Fairbanks",
        state: "AK",
        postal_code: "99701",
        position: {
          longitude: -147.7024008,
          latitude: 64.8515679,
        },
        info_url: "https://www.safeway.com/pharmacy/covid-19.html",
        booking_url: "https://kordinator.mhealthcoach.net/vcl/1600116808972",
        availability: {
          source: "univaf-albertsons",
          available: "NO",
          products: ["moderna"],
          is_public: true,
          checked_at: expectDatetimeString(),
          valid_at: "2021-10-28T07:06:13.000Z",
        },
        meta: {
          albertsons_region: "Alaska",
          booking_url_adult:
            "https://kordinator.mhealthcoach.net/vcl/1600116808972",
        },
      },
      {
        name: "Carrs 1813",
        external_ids: [
          ["albertsons", "1600114849843"],
          ["albertsons_carrs", "1600114849843"],
          ["carrs", "1813"],
          ["albertsons_store_number", "carrs:1813"],
        ],
        location_type: "PHARMACY",
        provider: "albertsons",
        address_lines: ["1501 Huffman Road"],
        city: "Anchorage",
        state: "AK",
        postal_code: "99515",
        position: {
          longitude: -149.8559918,
          latitude: 61.1096597,
        },
        info_url: "https://www.albertsons.com/pharmacy/covid-19.html",
        booking_url: "https://kordinator.mhealthcoach.net/vcl/1600114849843",
        availability: {
          source: "univaf-albertsons",
          available: "YES",
          products: ["pfizer", "moderna"],
          is_public: true,
          checked_at: expectDatetimeString(),
          valid_at: "2021-10-28T07:06:13.000Z",
        },
        meta: {
          albertsons_region: "Alaska",
          booking_url_adult:
            "https://kordinator.mhealthcoach.net/vcl/1600114849843",
        },
      },
    ]);
  });

  it("should fix names that repeat after the store number", async () => {
    nock(API_URL_BASE)
      .get(API_URL_PATH)
      .query(true)
      .reply(200, [
        {
          id: "1600116808972",
          region: "Alaska",
          address: "Safeway 3410 Safeway - 30 College Rd, Fairbanks, AK, 99701",
          lat: "64.8515679",
          long: "-147.7024008",
          coach_url: "https://kordinator.mhealthcoach.net/vcl/1600116808972",
          availability: "no",
          drugName: ["Moderna"],
        },
      ]);

    const result = await checkAvailability(() => {}, { states: "AK" });
    expect(result[0]).toHaveProperty("name", "Safeway 3410");
    expect(result[0]).toHaveProperty("address_lines", ["30 College Rd"]);
    expect(result).toContainItemsMatchingSchema(locationSchema);
  });

  it("handles unexpected availability strings", async () => {
    nock(API_URL_BASE)
      .get(API_URL_PATH)
      .query(true)
      .reply(200, [
        {
          id: "1600116808972",
          region: "Alaska",
          address: "Safeway 3410 - 30 College Rd, Fairbanks, AK, 99701",
          lat: "64.8515679",
          long: "-147.7024008",
          coach_url: "https://kordinator.mhealthcoach.net/vcl/1600116808972",
          availability: "whoseywhatsit?",
          drugName: ["Moderna"],
        },
      ]);

    const result = await checkAvailability(() => {}, { states: "AK" });
    expect(result).toContainItemsMatchingSchema(locationSchema);
    expect(result[0]).toHaveProperty(
      "availability.available",
      Available.unknown
    );
  });

  it("handles missing drugName property", async () => {
    nock(API_URL_BASE)
      .get(API_URL_PATH)
      .query(true)
      .reply(200, [
        {
          id: "1600116808972",
          region: "Alaska",
          address: "Safeway 3410 - 30 College Rd, Fairbanks, AK, 99701",
          lat: "64.8515679",
          long: "-147.7024008",
          coach_url: "https://kordinator.mhealthcoach.net/vcl/1600116808972",
          availability: "yes",
        },
      ]);

    const result = await checkAvailability(() => {}, { states: "AK" });
    expect(result).toContainItemsMatchingSchema(locationSchema);
    expect(result[0].availability.products).toBe(undefined);
  });

  it("skips over unknown drugName values", async () => {
    nock(API_URL_BASE)
      .get(API_URL_PATH)
      .query(true)
      .reply(200, [
        {
          id: "1600116808972",
          region: "Alaska",
          address: "Safeway 3410 - 30 College Rd, Fairbanks, AK, 99701",
          lat: "64.8515679",
          long: "-147.7024008",
          coach_url: "https://kordinator.mhealthcoach.net/vcl/1600116808972",
          availability: "whoseywhatsit?",
          drugName: ["Not A Known Vaccine", "Pfizer"],
        },
      ]);

    const result = await checkAvailability(() => {}, { states: "AK" });
    expect(result).toContainItemsMatchingSchema(locationSchema);
    expect(result[0]).toHaveProperty("availability.products", ["pfizer"]);
  });

  it("handles separate adult and pediatric entries for the same location", async () => {
    nock(API_URL_BASE)
      .get(API_URL_PATH)
      .query(true)
      .reply(
        200,
        [
          {
            id: "1635993536219",
            region: "Eastern_-_6",
            address:
              "Pfizer Child - Safeway 0005 - 11120 South Lakes Drive, Reston, VA, 20191",
            lat: "38.939784",
            long: "-77.332298",
            coach_url: "https://kordinator.mhealthcoach.net/vcl/1635993536219",
            availability: "yes",
            drugName: ["PfizerChild"],
          },
          {
            id: "1600100807144",
            region: "Virginia",
            address:
              "Safeway 0005 - 11120 South Lakes Drive, Reston, VA, 20191",
            lat: "38.939784",
            long: "-77.332298",
            coach_url: "https://kordinator.mhealthcoach.net/vcl/1600100807144",
            availability: "yes",
            drugName: ["Pfizer", "Moderna", "JnJ"],
          },
        ],
        { "Last-Modified": "Thu, 28 Oct 2021 07:06:13 GMT" }
      );

    const result = await checkAvailability(() => {}, { states: "VA" });
    expect(result).toContainItemsMatchingSchema(locationSchema);
    expect(result).toEqual([
      {
        name: "Safeway 0005",
        external_ids: [
          ["albertsons", "1635993536219"],
          ["albertsons_safeway", "1635993536219"],
          ["safeway", "0005"],
          ["albertsons_store_number", "safeway:0005"],
          ["albertsons", "1600100807144"],
          ["albertsons_safeway", "1600100807144"],
        ],
        location_type: "PHARMACY",
        provider: "albertsons",
        address_lines: ["11120 South Lakes Drive"],
        city: "Reston",
        state: "VA",
        postal_code: "20191",
        position: {
          longitude: -77.332298,
          latitude: 38.939784,
        },
        info_url: "https://www.safeway.com/pharmacy/covid-19.html",
        booking_url: "https://www.mhealthappointments.com/covidappt",
        availability: {
          source: "univaf-albertsons",
          available: "YES",
          products: ["pfizer_age_5_11", "pfizer", "moderna", "jj"],
          is_public: true,
          checked_at: expectDatetimeString(),
          valid_at: "2021-10-28T07:06:13.000Z",
        },
        meta: {
          albertsons_region: "Virginia",
          booking_url_adult:
            "https://kordinator.mhealthcoach.net/vcl/1600100807144",
          booking_url_pediatric:
            "https://kordinator.mhealthcoach.net/vcl/1635993536219",
        },
      },
    ]);
  });

  it("should throw an error when HTTP requests fail", async () => {
    nock(API_URL_BASE).post(API_URL_PATH).reply(500, {
      errors: "Oh no!",
    });

    const error = await checkAvailability(() => null, { states: "AK" }).then(
      () => null,
      (error) => error
    );
    expect(error).toBeInstanceOf(Error);
  });
});
