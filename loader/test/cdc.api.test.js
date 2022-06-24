const path = require("path");
const fs = require("fs/promises");
const nock = require("nock");
const {
  API_HOST,
  API_PATH,
  checkAvailability,
  formatStore,
} = require("../src/sources/cdc/api");
const { Available } = require("../src/model");
const { locationSchema } = require("./support/schemas");

// Mock utils so we can track logs.
jest.mock("../src/utils");

describe("CDC Open Data API", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  const fixturePath = path.join(__dirname, "fixtures/cdc.api.01929.json");

  it.nock("should output valid data", async () => {
    const result = await checkAvailability(() => {}, { states: "AK" });
    expect(result).toContainItemsMatchingSchema(locationSchema);
  });

  it("should only show products that are in stock", async () => {
    // This fixture lists Moderna, Pfizer, and J&J products, but only Pfizer is
    // flagged as in stock.
    nock(API_HOST).get(API_PATH).query(true).replyWithFile(200, fixturePath, {
      "Content-Type": "application/json",
    });

    const locations = await checkAvailability(() => null, { states: "NJ" });
    expect(locations).toHaveLength(1);
    expect(locations[0]).toHaveProperty("availability.products", ["pfizer"]);
  });

  it("should report availability based on supply and stock", async () => {
    const baseEntry = JSON.parse(await fs.readFile(fixturePath, "utf8"))[0];
    nock(API_HOST)
      .get(API_PATH)
      .query(true)
      .reply(200, [
        {
          ...baseEntry,
          provider_location_guid: "a",
          in_stock: true,
          supply_level: "2",
        },
        {
          ...baseEntry,
          provider_location_guid: "b",
          in_stock: false,
          supply_level: "0",
        },
        {
          ...baseEntry,
          provider_location_guid: "c",
          in_stock: false,
          supply_level: "-1",
        },
      ]);

    const locations = await checkAvailability(() => null, { states: "NJ" });
    expect(locations).toHaveProperty("0.availability.available", Available.yes);
    expect(locations).toHaveProperty("1.availability.available", Available.no);
    expect(locations).toHaveProperty(
      "2.availability.available",
      Available.unknown
    );
    expect(locations).toContainItemsMatchingSchema(locationSchema);
  });

  it("reports unknown availability if `in_stock` and `supply_level` conflict", async () => {
    const baseEntry = JSON.parse(await fs.readFile(fixturePath, "utf8"))[0];
    nock(API_HOST)
      .get(API_PATH)
      .query(true)
      .reply(200, [
        {
          ...baseEntry,
          provider_location_guid: "a",
          in_stock: false,
          supply_level: "1",
        },
        {
          ...baseEntry,
          provider_location_guid: "b",
          in_stock: true,
          supply_level: "0",
        },
      ]);

    const locations = await checkAvailability(() => null, { states: "NJ" });
    expect(locations).toHaveProperty(
      "0.availability.available",
      Available.unknown
    );
    expect(locations).toHaveProperty(
      "1.availability.available",
      Available.unknown
    );
    expect(locations).toContainItemsMatchingSchema(locationSchema);
  });

  it("supports Walmart data with no `loc_store_no`", () => {
    const formatted = formatStore(
      [
        {
          provider_location_guid: "fe474d63-41c6-4587-a80b-d8463b8973fa",
          loc_store_no: "Not applicable",
          loc_phone: "713-461-2915",
          loc_name: "Walmart Pharmacy 148",
          loc_admin_street1: "3855 Lamar Ave",
          loc_admin_city: "Paris",
          loc_admin_state: "TX",
          loc_admin_zip: "75462",
          ndc: "59267-1000-01",
          med_name: "Pfizer-BioNTech, COVID-19 Vaccine, 30 mcg/0.3mL",
          in_stock: false,
          supply_level: "0",
          quantity_last_updated: "2022-01-09",
          latitude: "33.664697",
          longitude: "-95.505641",
          category: "covid",
        },
      ],
      new Date()
    );

    expect(formatted).toHaveProperty("external_ids", [
      ["vaccines_gov", "fe474d63-41c6-4587-a80b-d8463b8973fa"],
      ["walmart", "148"],
    ]);
  });

  it("supports Walmart data with no `loc_store_no` and `10-` prefix", () => {
    const formatted = formatStore(
      [
        {
          provider_location_guid: "fe474d63-41c6-4587-a80b-d8463b8973fa",
          loc_store_no: "Not applicable",
          loc_phone: "713-461-2915",
          loc_name: "Walmart Pharmacy 10-0148",
          loc_admin_street1: "3855 Lamar Ave",
          loc_admin_city: "Paris",
          loc_admin_state: "TX",
          loc_admin_zip: "75462",
          ndc: "59267-1000-01",
          med_name: "Pfizer-BioNTech, COVID-19 Vaccine, 30 mcg/0.3mL",
          in_stock: false,
          supply_level: "0",
          quantity_last_updated: "2022-01-09",
          latitude: "33.664697",
          longitude: "-95.505641",
          category: "covid",
        },
      ],
      new Date()
    );

    expect(formatted).toHaveProperty("external_ids", [
      ["vaccines_gov", "fe474d63-41c6-4587-a80b-d8463b8973fa"],
      ["walmart", "148"],
    ]);
  });

  it("supports Bartell data with multiple external_id systems", () => {
    const formatted = formatStore(
      [
        {
          provider_location_guid: "fe474d63-41c6-4587-a80b-d8463b8973fa",
          loc_store_no: "06958",
          loc_phone: "713-461-2915",
          loc_name: "The Bartell Drug Co #06958",
          loc_admin_street1: "3855 Lamar Ave",
          loc_admin_city: "Paris",
          loc_admin_state: "TX",
          loc_admin_zip: "75462",
          ndc: "59267-1000-01",
          med_name: "Pfizer-BioNTech, COVID-19 Vaccine, 30 mcg/0.3mL",
          in_stock: false,
          supply_level: "0",
          quantity_last_updated: "2022-01-09",
          latitude: "33.664697",
          longitude: "-95.505641",
          category: "covid",
        },
      ],
      new Date()
    );

    expect(formatted).toHaveProperty("external_ids", [
      ["vaccines_gov", "fe474d63-41c6-4587-a80b-d8463b8973fa"],
      ["bartell", "58"],
      ["rite_aid", "6958"],
    ]);
  });

  it("cleans up not-quite-valid URLs", async () => {
    const baseEntry = JSON.parse(await fs.readFile(fixturePath, "utf8"))[0];
    const formatted = formatStore(
      [
        {
          ...baseEntry,
          web_address: "www.cvs.com/covid/",
        },
      ],
      new Date()
    );

    expect(formatted).toHaveProperty("info_url", "http://www.cvs.com/covid/");
  });

  it("skips rows for unsupported providers", () => {
    const formatted = formatStore(
      [
        {
          provider_location_guid: "fe474d63-41c6-4587-a80b-d8463b8973fa",
          loc_store_no: "06958",
          loc_phone: "713-461-2915",
          loc_name: "Some random provider",
          loc_admin_street1: "3855 Lamar Ave",
          loc_admin_city: "Paris",
          loc_admin_state: "TX",
          loc_admin_zip: "75462",
          ndc: "59267-1000-01",
          med_name: "Pfizer-BioNTech, COVID-19 Vaccine, 30 mcg/0.3mL",
          in_stock: false,
          supply_level: "0",
          quantity_last_updated: "2022-01-09",
          latitude: "33.664697",
          longitude: "-95.505641",
          category: "covid",
        },
      ],
      new Date()
    );

    expect(formatted).toBeFalsy();
  });

  it("reports minimum age in months", async () => {
    const baseEntry = JSON.parse(await fs.readFile(fixturePath, "utf8"))[0];
    const formatted = formatStore(
      [
        {
          ...baseEntry,
          min_age_months: "0",
          min_age_years: "12",
        },
      ],
      new Date()
    );

    expect(formatted).toHaveProperty("minimum_age_months", 144);
  });

  it("reports null for minimum ages that are 0", async () => {
    const baseEntry = JSON.parse(await fs.readFile(fixturePath, "utf8"))[0];
    const formatted = formatStore(
      [
        {
          ...baseEntry,
          min_age_months: "0",
          min_age_years: "0",
        },
      ],
      new Date()
    );

    expect(formatted.minimum_age_months).toBeNull();
  });
});
