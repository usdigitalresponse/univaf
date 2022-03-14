import "./matchers";
import { validateAvailabilityInput, validateState } from "../src/validation";
import { Availability } from "../src/interfaces";
import { ValueError } from "../src/exceptions";

describe("validateAvailabilityInput", () => {
  it("validates availability data", () => {
    validateAvailabilityInput({
      source: "example",
      available: Availability.YES,
      checked_at: "2021-10-01T00:00:00Z",
    });

    expect(() => {
      validateAvailabilityInput({
        source: "example",
        available: Availability.YES,
        // missing checked_at field
      });
    }).toThrow(ValueError);
  });

  it("fills in fields that are missing from data that is available", () => {
    const result = validateAvailabilityInput({
      source: "example",
      available: Availability.YES,
      checked_at: "2021-10-01T00:00:00Z",
    });
    expect(result).toEqual({
      source: "example",
      available: Availability.YES,
      checked_at: "2021-10-01T00:00:00Z",
      valid_at: "2021-10-01T00:00:00Z",
      is_public: true,
    });
  });

  it("fills in counts, products, doses from capacity", () => {
    const capacity = [
      {
        date: "2021-10-01",
        products: ["pfizer"],
        available: "YES",
        available_count: 5,
        unavailable_count: 0,
      },
      {
        date: "2021-10-02",
        products: ["pfizer", "moderna"],
        available: "YES",
        available_count: 2,
        unavailable_count: 0,
      },
    ];
    const result = validateAvailabilityInput({
      source: "example",
      available: Availability.YES,
      checked_at: "2021-10-01T00:00:00Z",
      capacity,
    });

    expect(result).toEqual({
      source: "example",
      available: Availability.YES,
      checked_at: "2021-10-01T00:00:00Z",
      valid_at: "2021-10-01T00:00:00Z",
      is_public: true,
      capacity,
      available_count: 7,
      products: ["pfizer", "moderna"],
    });
  });

  it("fills in capacity from slots, if provided", () => {
    const slots = [
      {
        end: "2021-10-01T09:15:00.000-09:00",
        start: "2021-10-01T09:00:00.000-09:00",
        products: ["pfizer"],
        available: "NO",
      },
      {
        end: "2021-10-01T09:30:00.000-09:00",
        start: "2021-10-01T09:15:00.000-09:00",
        products: ["pfizer"],
        available: "NO",
      },
      {
        end: "2021-10-01T09:45:00.000-09:00",
        start: "2021-10-01T09:30:00.000-09:00",
        products: ["pfizer"],
        available: "NO",
      },
      {
        end: "2021-10-02T09:15:00.000-09:00",
        start: "2021-10-02T09:00:00.000-09:00",
        products: ["pfizer"],
        available: "NO",
      },
      {
        end: "2021-10-02T09:30:00.000-09:00",
        start: "2021-10-02T09:15:00.000-09:00",
        products: ["pfizer"],
        available: "YES",
      },
      {
        end: "2021-10-02T09:45:00.000-09:00",
        start: "2021-10-02T09:30:00.000-09:00",
        products: ["pfizer"],
        available: "YES",
      },
    ];
    const result = validateAvailabilityInput({
      source: "example",
      available: Availability.YES,
      checked_at: "2021-10-01T00:00:00Z",
      slots,
    });

    expect(result).toEqual({
      source: "example",
      available: Availability.YES,
      checked_at: "2021-10-01T00:00:00Z",
      valid_at: "2021-10-01T00:00:00Z",
      is_public: true,
      slots,
      available_count: 2,
      products: ["pfizer"],
      capacity: [
        {
          date: "2021-10-01",
          products: ["pfizer"],
          available: "NO",
          available_count: 0,
          unavailable_count: 3,
        },
        {
          date: "2021-10-02",
          products: ["pfizer"],
          available: "YES",
          available_count: 2,
          unavailable_count: 1,
        },
      ],
    });
  });
});

describe("validateState", () => {
  it("gets the postal abbreviation given a state name", () => {
    expect(validateState("Oklahoma")).toEqual("OK");
  });

  it("gets the postal abbreviation given a postal abbreviation", () => {
    expect(validateState("AL")).toEqual("AL");
  });

  it("ignores case", () => {
    expect(validateState("OkLaHoMa")).toEqual("OK");
    expect(validateState("oK")).toEqual("OK");
  });

  it("throws if no matching state is found", () => {
    expect(() => validateState("whatever")).toThrow(ValueError);
  });
});
