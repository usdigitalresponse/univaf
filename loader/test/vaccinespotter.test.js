const { Available } = require("../src/model");
const { formatStore } = require("../src/sources/vaccinespotter/index");
const { expectDatetimeString } = require("./support");

describe("VaccineSpotter", () => {
  const basicVaccineSpotterStore = {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [-124.13914369, 40.78085044],
    },
    properties: {
      id: 2736954,
      url: "https://www.walgreens.com/findcare/vaccination/covid-19",
      city: "EUREKA",
      name: "Walgreen Drug Store",
      state: "CA",
      address: "2525 HARRIS ST",
      provider: "walgreens",
      time_zone: "America/Los_Angeles",
      postal_code: "95503",
      provider_brand: "walgreens",
      carries_vaccine: null,
      provider_brand_id: 47,
      provider_brand_name: "Walgreens",
      provider_location_id: "5863",
    },
  };
  it("should format a Walgreens store", () => {
    const result = formatStore({
      ...basicVaccineSpotterStore,
      properties: {
        ...basicVaccineSpotterStore.properties,
        appointment_types: {
          all_doses: true,
          "2nd_dose_only": true,
        },
        appointments_available: true,
        appointment_vaccine_types: {
          moderna: true,
        },
        appointments_last_fetched: "2021-05-04T07:10:03.196+00:00",
        appointments_last_modified: "2021-05-04T07:10:03.196+00:00",
        appointments_available_all_doses: true,
        appointments_available_2nd_dose_only: true,
        appointments: [
          {
            time: "2021-05-05T08:50:00.000-07:00",
            type: "Moderna",
            vaccine_types: ["moderna"],
            appointment_types: ["all_doses"],
          },
          {
            time: "2021-05-05T08:50:00.000-07:00",
            type: "Moderna - 2nd Dose Only",
            vaccine_types: ["moderna"],
            appointment_types: ["2nd_dose_only"],
          },
          {
            time: "2021-05-05T09:05:00.000-07:00",
            type: "Moderna",
            vaccine_types: ["moderna"],
            appointment_types: ["all_doses"],
          },
          {
            time: "2021-05-05T09:05:00.000-07:00",
            type: "Moderna - 2nd Dose Only",
            vaccine_types: ["moderna"],
            appointment_types: ["2nd_dose_only"],
          },
          {
            time: "2021-05-06T08:35:00.000-07:00",
            type: "Moderna",
            vaccine_types: ["moderna"],
            appointment_types: ["all_doses"],
          },
          {
            time: "2021-05-06T08:35:00.000-07:00",
            type: "Moderna - 2nd Dose Only",
            vaccine_types: ["moderna"],
            appointment_types: ["2nd_dose_only"],
          },
          {
            time: "2021-05-06T08:50:00.000-07:00",
            type: "Moderna",
            vaccine_types: ["moderna"],
            appointment_types: ["all_doses"],
          },
          {
            time: "2021-05-06T08:50:00.000-07:00",
            type: "Moderna - 2nd Dose Only",
            vaccine_types: ["moderna"],
            appointment_types: ["2nd_dose_only"],
          },
        ],
      },
    });

    expect(result).toEqual({
      id: "walgreens:5863",
      location_type: "PHARMACY",
      address_lines: ["2525 Harris St"],
      booking_phone: "1-800-925-4733",
      booking_url: "https://www.walgreens.com/findcare/vaccination/covid-19",
      city: "Eureka",
      county: undefined,
      external_ids: [
        ["vaccinespotter", "2736954"],
        ["walgreens", "5863"],
      ],
      name: "Walgreen Drug Store",
      position: {
        latitude: 40.78085044,
        longitude: -124.13914369,
      },
      postal_code: "95503",
      provider: "walgreens",
      state: "CA",
      meta: {
        time_zone: "America/Los_Angeles",
        vaccinespotter: {
          brand: "walgreens",
          brand_id: 47,
          provider: "walgreens",
        },
      },
      availability: {
        source: "univaf-vaccinespotter",
        valid_at: "2021-05-04T07:10:03.196+00:00",
        checked_at: expectDatetimeString(),
        available: "YES",
        capacity: [
          {
            available: "YES",
            available_count: 2,
            date: "2021-05-05",
            dose: "all_doses",
            products: ["moderna"],
          },
          {
            available: "YES",
            available_count: 2,
            date: "2021-05-05",
            dose: "2nd_dose_only",
            products: ["moderna"],
          },
          {
            available: "YES",
            available_count: 2,
            date: "2021-05-06",
            dose: "all_doses",
            products: ["moderna"],
          },
          {
            available: "YES",
            available_count: 2,
            date: "2021-05-06",
            dose: "2nd_dose_only",
            products: ["moderna"],
          },
        ],
        doses: ["all_doses", "2nd_dose_only"],
        products: ["moderna"],
        slots: [
          {
            available: "YES",
            dose: "all_doses",
            products: ["moderna"],
            start: "2021-05-05T08:50:00.000-07:00",
          },
          {
            available: "YES",
            dose: "2nd_dose_only",
            products: ["moderna"],
            start: "2021-05-05T08:50:00.000-07:00",
          },
          {
            available: "YES",
            dose: "all_doses",
            products: ["moderna"],
            start: "2021-05-05T09:05:00.000-07:00",
          },
          {
            available: "YES",
            dose: "2nd_dose_only",
            products: ["moderna"],
            start: "2021-05-05T09:05:00.000-07:00",
          },
          {
            available: "YES",
            dose: "all_doses",
            products: ["moderna"],
            start: "2021-05-06T08:35:00.000-07:00",
          },
          {
            available: "YES",
            dose: "2nd_dose_only",
            products: ["moderna"],
            start: "2021-05-06T08:35:00.000-07:00",
          },
          {
            available: "YES",
            dose: "all_doses",
            products: ["moderna"],
            start: "2021-05-06T08:50:00.000-07:00",
          },
          {
            available: "YES",
            dose: "2nd_dose_only",
            products: ["moderna"],
            start: "2021-05-06T08:50:00.000-07:00",
          },
        ],
      },
    });
  });

  it("should have no doses entry if there was no dose info", () => {
    const result = formatStore({
      ...basicVaccineSpotterStore,
      properties: {
        ...basicVaccineSpotterStore.properties,
        appointment_types: {},
        appointments_available: true,
        appointment_vaccine_types: {
          moderna: true,
        },
        appointments_last_fetched: "2021-05-04T07:10:03.196+00:00",
        appointments_last_modified: "2021-05-04T07:10:03.196+00:00",
        appointments_available_all_doses: null,
        appointments_available_2nd_dose_only: null,
        appointments: [
          {
            time: "2021-05-05T08:50:00.000-07:00",
            type: "Moderna",
            vaccine_types: ["moderna"],
            appointment_types: [],
          },
          {
            time: "2021-05-05T09:05:00.000-07:00",
            type: "Moderna",
            vaccine_types: ["moderna"],
            appointment_types: [],
          },
          {
            time: "2021-05-06T08:35:00.000-07:00",
            type: "Moderna",
            vaccine_types: ["moderna"],
            appointment_types: [],
          },
          {
            time: "2021-05-06T08:50:00.000-07:00",
            type: "Moderna",
            vaccine_types: ["moderna"],
            appointment_types: [],
          },
        ],
      },
    });

    expect(result.availability.doses).toEqual(undefined);
  });

  it("should not fail on locations with malformed `appointments` data", () => {
    const result = formatStore({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [-124.13914369, 40.78085044],
      },
      properties: {
        id: 141675345,
        url: "https://www.healthmartcovidvaccine.com/",
        city: "DUNELLEN",
        name: "RAY PHARMACY",
        state: "NJ",
        address: "187 North Ave",
        provider: "health_mart",
        time_zone: "",
        postal_code: "08812",
        appointments: [{ time: null }, { time: null }, { time: null }],
        provider_brand: "health_mart",
        carries_vaccine: null,
        appointment_types: { unknown: true },
        provider_brand_id: 96517,
        provider_brand_name: "Health Mart",
        provider_location_id: "7366",
        appointments_available: true,
        appointment_vaccine_types: { unknown: true },
        appointments_last_fetched: "2021-05-10T05:50:53.025+00:00",
        appointments_last_modified: "2021-05-10T05:50:53.025+00:00",
        appointments_available_all_doses: true,
        appointments_available_2nd_dose_only: false,
      },
    });

    expect(result.availability).not.toHaveProperty("slots");
    expect(result.availability).not.toHaveProperty("capacity");
  });

  it("should handle locations with date-based appointments data", () => {
    const result = formatStore({
      ...basicVaccineSpotterStore,
      properties: {
        ...basicVaccineSpotterStore.properties,
        appointments: [
          {
            date: "2021-05-05",
            type: "Moderna",
            vaccine_types: ["moderna"],
            appointment_types: [],
          },
          {
            time: "2021-05-06",
            type: "Moderna",
            vaccine_types: ["moderna"],
            appointment_types: [],
          },
        ],
      },
    });

    // We should recognize that this is not slot-level data.
    expect(result.availability.slots).toEqual(undefined);
    expect(result.availability.capacity).toEqual([
      {
        date: "2021-05-05",
        available: Available.yes,
        products: ["moderna"],
        available_count: 1,
      },
      {
        date: "2021-05-06",
        available: Available.yes,
        products: ["moderna"],
        available_count: 1,
      },
    ]);
  });

  it("should handle locations with `null` for their brand", () => {
    const result = formatStore({
      ...basicVaccineSpotterStore,
      properties: {
        ...basicVaccineSpotterStore.properties,
        provider: "health_mart",
        provider_brand: null,
        provider_brand_id: null,
        provider_brand_name: null,
      },
    });

    expect(result).toHaveProperty("provider", "health_mart");
  });

  it("it should name unnamed locations by the brand name", () => {
    const result = formatStore({
      ...basicVaccineSpotterStore,
      properties: {
        ...basicVaccineSpotterStore.properties,
        name: "",
        provider_brand_name: "Harvey's",
      },
    });

    expect(result.name).toEqual("Harvey's");
  });

  it("it should calculate an ID for southeasern_grocers brands", () => {
    const result = formatStore({
      ...basicVaccineSpotterStore,
      properties: {
        ...basicVaccineSpotterStore.properties,
        name: "",
        provider: "southeastern_grocers",
        provider_brand: "harveys",
        provider_brand_id: 1386,
        provider_brand_name: "Harveys",
        provider_location_id: "3-1688",
      },
    });

    expect(result).toHaveProperty("name", "Harveys #1688");
    expect(result.external_ids).toContainEqual(["harveys", "1688"]);
  });

  it("it should always send an array for address_lines", () => {
    const result = formatStore({
      ...basicVaccineSpotterStore,
      properties: {
        ...basicVaccineSpotterStore.properties,
        address: "",
      },
    });

    expect(result).toHaveProperty("address_lines", undefined);
  });

  it("should include an unpadded version of each external ID", () => {
    const result = formatStore({
      ...basicVaccineSpotterStore,
      properties: {
        ...basicVaccineSpotterStore.properties,
        provider_location_id: "005613",
      },
    });

    expect(result.external_ids).toEqual([
      ["vaccinespotter", "2736954"],
      ["walgreens", "005613"],
      ["walgreens", "5613"],
    ]);
  });

  it("does not unpadd external IDs that look like UUIDs", () => {
    const result = formatStore({
      ...basicVaccineSpotterStore,
      properties: {
        ...basicVaccineSpotterStore.properties,
        provider_location_id: "00751004-25e5-4628-b606-a8bafb61581e",
      },
    });

    expect(result.external_ids).toEqual([
      ["vaccinespotter", "2736954"],
      ["walgreens", "00751004-25e5-4628-b606-a8bafb61581e"],
    ]);
  });
});
