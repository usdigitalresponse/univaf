const { checkAvailability, formatLocation } = require("../src/sources/heb");
const { LocationType, Available } = require("../src/model");
const { expectDatetimeString } = require("./support");
const { locationSchema } = require("./support/schemas");

describe("H-E-B", () => {
  it.nock("should output valid data", { ignoreQuery: ["v"] }, async () => {
    const result = await checkAvailability(() => {}, { states: "TX" });
    expect(result).toContainItemsMatchingSchema(locationSchema);
  });

  it("should format correct output for a store", () => {
    const formatted = formatLocation({
      zip: "78209-5703",
      url: "https://heb.secure.force.com/FlexibleScheduler/FSAppointment?event_ID=a8h4P000000Gub6QAC",
      type: "store",
      street: "4821 BROADWAY",
      storeNumber: 191,
      state: "TX",
      slotDetails: [
        {
          openTimeslots: 1,
          openAppointmentSlots: 1,
          manufacturer: "Janssen",
        },
        {
          openTimeslots: 36,
          openAppointmentSlots: 36,
          manufacturer: "Moderna",
        },
        {
          openTimeslots: 39,
          openAppointmentSlots: 39,
          manufacturer: "Pfizer",
        },
      ],
      openTimeslots: 76,
      openFluTimeslots: 0,
      openFluAppointmentSlots: 0,
      openAppointmentSlots: 76,
      name: "Broadway Central Market",
      longitude: -98.46408,
      latitude: 29.47069,
      fluUrl: "",
      city: "SAN ANTONIO",
    });

    expect(formatted).toEqual({
      name: "Broadway Central Market",
      location_type: LocationType.pharmacy,
      provider: "heb",
      external_ids: [["heb", "191"]],
      address_lines: ["4821 BROADWAY"],
      city: "SAN ANTONIO",
      state: "TX",
      postal_code: "78209-5703",
      position: {
        longitude: -98.46408,
        latitude: 29.47069,
      },
      booking_url:
        "https://heb.secure.force.com/FlexibleScheduler/FSAppointment?event_ID=a8h4P000000Gub6QAC",
      availability: {
        source: "univaf-heb",
        valid_at: undefined,
        available: Available.yes,
        checked_at: expectDatetimeString(),
        is_public: true,
        available_count: 76,
        products: ["jj", "moderna", "pfizer"],
      },
    });
  });
});
