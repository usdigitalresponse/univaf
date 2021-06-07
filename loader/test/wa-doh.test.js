const nock = require("nock");
const {
  API_URL,
  checkAvailability,
  WaDohApiError,
} = require("../src/sources/wa-doh");
const {
  withRecordedHttp,
  expectDatetimeString,
  splitHostAndPath,
} = require("./support");

const [API_URL_BASE, API_URL_PATH] = splitHostAndPath(API_URL);

describe("Washington DoH API", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.restore();
  });

  it(
    ...withRecordedHttp("should successfully format results", async () => {
      const result = await checkAvailability(() => {}, { states: "PR" });
      expect(result).toEqual([
        {
          address_lines: [
            "PR #30 INTERSECCION AVENDIA",
            "RAFAEL CORDERO BARIO",
          ],
          availability: {
            available: "NO",
            checked_at: expectDatetimeString(),
            is_public: true,
            products: ["pfizer", "moderna"],
            source: "univaf-wa-doh",
            updated_at: "2021-06-05T19:10:58.407Z",
          },
          booking_phone: "(787) 653-6929",
          booking_url: "https://book.appointment-plus.com/d133yng2",
          city: "Caguas",
          county: undefined,
          description: "null",
          external_ids: {
            appointment_plus: "625",
            costco: "365",
            wa_doh: "costco-625",
          },
          id: "costco-625",
          info_url: undefined,
          location_type: "PHARMACY",
          meta: {},
          name: "Costco Caguas",
          position: {
            latitude: 18.251949,
            longitude: -66.024857,
          },
          postal_code: "PR00725",
          provider: "costco",
          state: "PR",
        },
        {
          address_lines: ["PARQUE IND MINILAS 125 CALLE A"],
          availability: {
            available: "NO",
            checked_at: expectDatetimeString(),
            is_public: true,
            products: ["pfizer", "moderna"],
            source: "univaf-wa-doh",
            updated_at: "2021-06-05T19:10:58.407Z",
          },
          booking_phone: "(787) 993-9310",
          booking_url: "https://book.appointment-plus.com/d133yng2",
          city: "Bayamon",
          county: undefined,
          description: "null",
          external_ids: {
            appointment_plus: "621",
            costco: "363",
            wa_doh: "costco-621",
          },
          id: "costco-621",
          info_url: undefined,
          location_type: "PHARMACY",
          meta: {},
          name: "Costco East Bayamon",
          position: {
            latitude: 18.384665,
            longitude: -66.138741,
          },
          postal_code: "PR00959",
          provider: "costco",
          state: "PR",
        },
      ]);
    })
  );

  it("should throw WaDohApiError with detailed error info", async () => {
    nock(API_URL_BASE)
      .post(API_URL_PATH)
      .reply(500, {
        errors: [
          {
            message: 'Expected type Int!, found "hello".',
            locations: [{ line: 3, column: 50 }],
            extensions: {
              code: "GRAPHQL_VALIDATION_FAILED",
            },
          },
        ],
      });

    const error = await checkAvailability(() => null, { states: "PR" }).then(
      () => null,
      (error) => error
    );
    expect(error).toBeInstanceOf(WaDohApiError);
    expect(error.message).toContain("Expected type Int!");
  });
});
