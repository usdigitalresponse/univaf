const { formatLocation } = require("../src/sources/hyvee");
const { Available, LocationType } = require("../src/model");
const { expectDatetimeString } = require("./support");

describe("H-E-B", () => {
  it("should format correct output for a store", () => {
    const formatted = formatLocation(
      {
        locationId: "fa22572e-ad2b-4cec-a787-dec0fb3ea086",
        name: "Waterloo #2",
        nickname: "Logan",
        phoneNumber: "+13192348627",
        businessCode: "1863",
        covidVaccineTimeSlotAndManufacturerAvailability: {
          isCovidVaccineAvailable: true,
          availableCovidVaccineManufacturers: [
            {
              covidVaccineManufacturerId:
                "e7388e53-33dd-48a2-bf9c-10a883a4c98c",
              manufacturerName: "Moderna",
              isSingleDose: false,
              isBooster: false,
              __typename: "CovidVaccineManufacturer",
            },
            {
              covidVaccineManufacturerId:
                "2616ff22-429e-4e48-83ae-be3835fcc2aa",
              manufacturerName: "Pfizer-BioNTech",
              isSingleDose: false,
              isBooster: false,
              __typename: "CovidVaccineManufacturer",
            },
            {
              covidVaccineManufacturerId:
                "189d79f5-22d3-4e8a-856d-b7dd2139eb39",
              manufacturerName: "Flu Vaccine",
              isSingleDose: true,
              isBooster: false,
              __typename: "CovidVaccineManufacturer",
            },
            {
              covidVaccineManufacturerId:
                "d827e77f-b89c-47fa-9678-77929c5eae54",
              manufacturerName: "Janssen",
              isSingleDose: true,
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
      },
      "2021-10-11T00:00:00Z"
    );

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
      is_public: true,
      meta: { hyvee_nickname: "Logan" },
      availability: {
        source: "univaf-hyvee",
        available: Available.yes,
        checked_at: expectDatetimeString(),
        products: ["jj", "moderna", "pfizer"],
      },
    });
  });
});
