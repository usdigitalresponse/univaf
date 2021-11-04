const nock = require("nock");
const { VaccineProduct } = require("../src/model");
const {
  API_URL,
  checkAvailability,
  WaDohApiError,
  formatLocation,
} = require("../src/sources/wa-doh");
const { expectDatetimeString, splitHostAndPath } = require("./support");
const { locationSchema } = require("./support/schemas");

const [API_URL_BASE, API_URL_PATH] = splitHostAndPath(API_URL);

describe("Washington DoH API", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it.nock("should successfully format results", async () => {
    const result = await checkAvailability(() => {}, { states: "PR" });
    expect(result).toEqual([
      {
        address_lines: ["PR #30 INTERSECCION AVENDIA", "RAFAEL CORDERO BARIO"],
        availability: {
          available: "NO",
          checked_at: expectDatetimeString(),
          is_public: true,
          products: ["pfizer", "moderna"],
          source: "univaf-wa-doh",
          valid_at: "2021-06-05T19:10:58.407Z",
        },
        booking_phone: "(787) 653-6929",
        booking_url: "https://book.appointment-plus.com/d133yng2",
        city: "Caguas",
        county: undefined,
        description: "null",
        external_ids: [
          ["wa_doh", "costco-625"],
          ["costco", "365"],
          ["appointment_plus", "625"],
        ],
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
          valid_at: "2021-06-05T19:10:58.407Z",
        },
        booking_phone: "(787) 993-9310",
        booking_url: "https://book.appointment-plus.com/d133yng2",
        city: "Bayamon",
        county: undefined,
        description: "null",
        external_ids: [
          ["wa_doh", "costco-621"],
          ["costco", "363"],
          ["appointment_plus", "621"],
        ],
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
    expect(result).toContainItemsMatchingSchema(locationSchema);
  });

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

  it("identifies Pfizer adult and pediatric vaccines", () => {
    const result = formatLocation({
      locationId: "costco-625",
      locationName: "Costco Caguas",
      locationType: "Pharmacy",
      providerId: null,
      providerName: null,
      departmentId: "costco-625",
      departmentName: "Costco Caguas",
      addressLine1: "PR #30 INTERSECCION AVENDIA",
      addressLine2: "RAFAEL CORDERO BARIO",
      city: "Caguas",
      state: "PR",
      zipcode: "PR00725",
      county: null,
      latitude: 18.251949,
      longitude: -66.024857,
      description: null,
      contactFirstName: "Leticia",
      contactLastName: "Ortiz Vazquez",
      fax: "(787) 653-6948",
      phone: "(787) 653-6929",
      email: "w365phm@costco.com",
      schedulingLink: "https://book.appointment-plus.com/d133yng2",
      vaccineAvailability: "UNAVAILABLE",
      vaccineTypes: [
        "Pfizer-BioNTech (Comirnaty), ages 12 and up",
        "Pfizer-BioNTech Pediatric, ages 5 - 11",
      ],
      infoLink: null,
      timeZoneId: "56",
      directions: "",
      updatedAt: "2021-06-05T19:10:58.407Z",
      rawDataSourceName: "CostcoLocationsFn",
      accessibleParking: null,
      additionalSupports: null,
      commCardAvailable: null,
      commCardBrailleAvailable: null,
      driveupSite: null,
      interpretersAvailable: null,
      interpretersDesc: null,
      supportUrl: null,
      waitingArea: null,
      walkupSite: null,
      wheelchairAccessible: null,
      scheduleOnline: null,
      scheduleByPhone: null,
      scheduleByEmail: null,
      walkIn: null,
      waitList: null,
      __typename: "Location",
    });

    expect(result).toHaveProperty("availability.products", [
      VaccineProduct.pfizer,
      VaccineProduct.pfizerAge5_11,
    ]);
  });
});
