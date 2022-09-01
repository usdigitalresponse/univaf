const { states: stateData } = require("univaf-common");
const { expectDatetimeString } = require("univaf-common/jest");
const { checkAvailability, formatLocation } = require("../src/sources/hyvee");
const { Available, LocationType } = require("../src/model");
const { locationSchema } = require("./support/schemas");

// Mock utils so we can track logs.
jest.mock("../src/utils");

const RawLocation = {
  locationId: "fa22572e-ad2b-4cec-a787-dec0fb3ea086",
  name: "Waterloo #2",
  nickname: "Logan",
  phoneNumber: "+13192348627",
  businessCode: "1863",
  covidVaccineTimeSlotAndManufacturerAvailability: {
    isCovidVaccineAvailable: true,
    availableCovidVaccineManufacturers: [
      {
        covidVaccineManufacturerId: "e7388e53-33dd-48a2-bf9c-10a883a4c98c",
        manufacturerName: "Moderna",
        isSingleDose: false,
        isBooster: false,
        __typename: "CovidVaccineManufacturer",
      },
      {
        covidVaccineManufacturerId: "2616ff22-429e-4e48-83ae-be3835fcc2aa",
        manufacturerName: "Pfizer-BioNTech",
        isSingleDose: false,
        isBooster: false,
        __typename: "CovidVaccineManufacturer",
      },
      {
        covidVaccineManufacturerId: "189d79f5-22d3-4e8a-856d-b7dd2139eb39",
        manufacturerName: "Flu Vaccine",
        isSingleDose: true,
        isBooster: false,
        __typename: "CovidVaccineManufacturer",
      },
      {
        covidVaccineManufacturerId: "d827e77f-b89c-47fa-9678-77929c5eae54",
        manufacturerName: "Janssen",
        isSingleDose: true,
        isBooster: false,
        __typename: "CovidVaccineManufacturer",
      },
      {
        covidVaccineManufacturerId: "dd8e390a-10c9-466f-85b9-18b8348a813d",
        manufacturerName: "Pediatric-Pfizer (5-11)",
        isSingleDose: false,
        isBooster: false,
        __typename: "CovidVaccineManufacturer",
      },
    ],
    __typename: "CovidVaccineTimeSlotAndManufacturerAvailability",
  },
  covidVaccineEligibilityTerms: "No eligibility terms defined.",
  address: {
    line1: "2181 Logan Ave",
    line2: null,
    city: "Waterloo",
    state: "IA",
    zip: "50703",
    latitude: 42.53037,
    longitude: -92.33859,
    __typename: "LocationAddress",
  },
  __typename: "Location",
};

describe("HyVee", () => {
  jest.setTimeout(30_000);

  it("should format correct output for a store", () => {
    const formatted = formatLocation(RawLocation, "2021-10-11T00:00:00Z");

    expect(formatted).toEqual({
      name: "HyVee Waterloo #2",
      location_type: LocationType.pharmacy,
      provider: "hyvee",
      external_ids: [
        ["hyvee", "fa22572e-ad2b-4cec-a787-dec0fb3ea086"],
        ["hyvee_store", "1863"],
      ],
      address_lines: ["2181 Logan Ave"],
      city: "Waterloo",
      state: "IA",
      postal_code: "50703",
      position: {
        latitude: 42.53037,
        longitude: -92.33859,
      },
      info_phone: "+13192348627",
      booking_url: "https://www.hy-vee.com/my-pharmacy/covid-vaccine-consent",
      meta: { hyvee_nickname: "Logan" },
      availability: {
        source: "univaf-hyvee",
        available: Available.yes,
        checked_at: expectDatetimeString(),
        products: ["moderna", "pfizer", "jj", "pfizer_age_5_11"],
      },
    });
    expect(formatted).toMatchSchema(locationSchema);
  });

  it("handles multi-line addresses", () => {
    const formatted = formatLocation(
      {
        ...RawLocation,
        address: {
          ...RawLocation.address,
          line1: "first line",
          line2: "second line",
        },
      },
      "2021-10-11T00:00:00Z"
    );

    expect(formatted).toHaveProperty("address_lines", [
      "first line",
      "second line",
    ]);
  });

  it("adds eligibility info to the description", () => {
    const formatted = formatLocation({
      ...RawLocation,
      covidVaccineEligibilityTerms: "Must be taller than 4 feet for this ride",
    });
    expect(formatted).toHaveProperty(
      "description",
      "Must be taller than 4 feet for this ride"
    );
  });

  it.nock("should output valid data", async () => {
    const states = stateData.map((x) => x.usps);
    const result = await checkAvailability(() => {}, { states });
    expect(result).toContainItemsMatchingSchema(locationSchema);
  });
});
