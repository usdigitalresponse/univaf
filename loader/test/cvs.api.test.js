const nock = require("nock");
const { checkAvailability, CvsApiError } = require("../src/sources/cvs/api");
const {
  CVS_BOOKING_URL,
  CVS_CORPORATE_PHARMACY_PHONE_NUMBER,
} = require("../src/sources/cvs/shared");
const { expectDatetimeString } = require("./support");

describe("CVS API", () => {
  const API_URL = "http://api.cvs.com/";

  let _env = {};
  beforeEach(() => {
    _env = Object.assign({}, process.env);
    process.env.CVS_API_URL = API_URL;
  });

  afterEach(() => {
    Object.assign(process.env, _env);
  });

  it("throws an error if there are no credentials", async () => {
    delete process.env.CVS_API_KEY;
    await expect(checkAvailability(() => null)).rejects.toThrow(/API key/i);
  });

  it("sends credentials", async () => {
    const apiKey = "ABC123";
    process.env.CVS_API_KEY = apiKey;

    const scope = nock(API_URL)
      .matchHeader("x-api-key", apiKey)
      .get("/immunization-status/v1/covax-availability?stateCode=NJ")
      .reply(200, { covaxAvailability: [] });

    await checkAvailability(() => null);

    expect(scope.isDone());
  });

  it("gets data from the CVS API", async () => {
    process.env.CVS_API_KEY = "xyz";

    nock(API_URL)
      .get("/immunization-status/v1/covax-availability?stateCode=NJ")
      .reply(200, {
        statusCode: "0000",
        statusDescription: "Success",
        covaxAvailability: [
          {
            storeId: 2196,
            address: "701 COLLEGE DRIVE",
            zipCode: "08012",
            city: "BLACKWOOD",
            stateCode: "NJ",
            availabilityStatusDescription: "Fully Booked",
          },
          {
            storeId: 2139,
            address: "2988 ROUTE 516",
            zipCode: "08857",
            city: "OLD BRIDGE",
            stateCode: "NJ",
            availabilityStatusDescription: "Available",
          },
        ],
        lastUpdated: "2021-03-09T17:08:30.842Z",
      });

    const result = await checkAvailability(() => null);
    expect(result).toEqual([
      {
        address_lines: ["701 COLLEGE DRIVE"],
        availability: {
          available: "NO",
          checked_at: expectDatetimeString(),
          is_public: true,
          source: "cvs-api",
          updated_at: "2021-03-09T17:08:30.842Z",
        },
        booking_phone: CVS_CORPORATE_PHARMACY_PHONE_NUMBER,
        booking_url: CVS_BOOKING_URL,
        city: "BLACKWOOD",
        county: null,
        external_ids: {
          cvs: "02196",
        },
        id: "CVS:02196",
        location_type: "PHARMACY",
        name: "CVS #2196",
        position: null,
        postal_code: "08012",
        provider: "CVS",
        state: "NJ",
      },
      {
        address_lines: ["2988 ROUTE 516"],
        availability: {
          available: "YES",
          checked_at: expectDatetimeString(),
          is_public: true,
          source: "cvs-api",
          updated_at: "2021-03-09T17:08:30.842Z",
        },
        booking_phone: CVS_CORPORATE_PHARMACY_PHONE_NUMBER,
        booking_url: CVS_BOOKING_URL,
        city: "OLD BRIDGE",
        county: null,
        external_ids: {
          cvs: "02139",
        },
        id: "CVS:02139",
        location_type: "PHARMACY",
        name: "CVS #2139",
        position: null,
        postal_code: "08857",
        provider: "CVS",
        state: "NJ",
      },
    ]);
  });

  it("throws a nicely formatted error from the API", async () => {
    process.env.CVS_API_KEY = "xyz";

    nock(API_URL)
      .get("/immunization-status/v1/covax-availability?stateCode=NJ")
      .reply(400, {
        statusCode: 5004,
        statusDescription:
          "The parameters you have provided do not seem to be valid.",
        fault: { more: "data" },
      });

    const error = await checkAvailability(() => null).then(
      () => null,
      (error) => error
    );
    expect(error).toBeInstanceOf(CvsApiError);
    expect(error.message).toContain("5004");
    expect(error.message).toContain(
      "The parameters you have provided do not seem to be valid."
    );
  });
});
