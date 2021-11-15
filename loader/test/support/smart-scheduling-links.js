const {
  scheduleReference,
  locationReference,
} = require("../../src/smart-scheduling-links");

/**
 * Create a new location object with dummy location data. Matches the format
 * returned by `getLocations()` in the smart-scheduling-links module.
 *
 * Optionally pass in an object with any key/value pairs to override on the
 * location. If it has an array for the `schedules` property, each element will
 * be used as a similar set of overrides on a dummy schedule attached to the
 * location. Similarly, if a schedules override has an array for its `slots`
 * property, each element will be used as a set of overrides on a dummy slot
 * attached to the schedule.
 *
 * By default, each location has one schedule and each schedule has one slot.
 * You can pass empty arrays for `schedules` (or a schedule's `slots`) to not
 * create any. If the array has > 1 item, then the same number of
 * scheudles/slots will be created.
 * @param {any} [overrides]
 * @returns {{location: any, schedules any[], slots: any[]}}
 */
function createSmartLocation(overrides) {
  const schedulesData = overrides?.schedules || [{}];
  delete overrides?.schedules;

  const id = Math.random().toString().slice(2);
  const location = {
    id,
    resourceType: "Location",
    name: "Test Location",
    telecom: [
      { system: "phone", value: "888-555-1234" },
      { system: "url", value: `https://example.com/${id}` },
    ],
    address: {
      line: ["123 Example Rd."],
      city: "Somewheresville",
      state: "SC",
      postalCode: "29614",
      district: "Greenville",
    },
    identifier: [
      {
        system: "https://example.com/store",
        value: "1234",
      },
    ],
    position: { latitude: 46.0763689, longitude: -118.2838519 },
    ...overrides,
  };

  const schedules = [];
  const slots = [];
  schedulesData.forEach((data, index) => {
    const result = createSmartSchedule(location, index, data);
    schedules.push(result.schedule);
    slots.push(...result.slots);
  });

  return { location, schedules, slots };
}

/**
 * Create a dummy schedule object that matches the SMART Scheduling Links spec.
 * @param {any} location Location object to create a schedule for.
 * @param {string|number} [idSuffix] Suffix to add to the schedule ID.
 * @param {any} [overrides]
 * @returns {{schedule: any, slots: any[]}}
 */
function createSmartSchedule(location, idSuffix, overrides) {
  const slotsData = overrides?.slots ?? [{}];
  delete overrides?.slots;

  const schedule = {
    [locationReference]: location,
    id: `${location.id}-${idSuffix}`,
    actor: [{ reference: `Location/${location.id}` }],
    resourceType: "Schedule",
    serviceType: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/service-type",
            code: "57",
            display: "Immunization",
          },
          {
            system:
              "http://fhir-registry.smarthealthit.org/CodeSystem/service-type",
            code: "covid19-immunization",
            display: "COVID-19 Immunization Appointment",
          },
        ],
      },
    ],
    extension: [
      {
        url: "http://fhir-registry.smarthealthit.org/StructureDefinition/vaccine-product",
        valueCoding: {
          system: "http://hl7.org/fhir/sid/cvx",
          code: 212,
          display: "Janssen COVID-19 Vaccine",
        },
      },
    ],
    ...overrides,
  };

  const slots = slotsData.map((data, index) =>
    createSmartSlot(schedule, index, data)
  );

  return { schedule, slots };
}

/**
 * Create a dummy slot object that matches the SMART Scheduling Links spec.
 * @param {any} schedule Schedule object that the slot belongs to.
 * @param {string|number} [idSuffix] Suffix to add to the Slot ID
 * @param {any} [overrides]
 * @returns {any}
 */
function createSmartSlot(schedule, idSuffix, overrides) {
  return {
    [scheduleReference]: schedule,
    id: `${schedule.id}-${idSuffix}`,
    resourceType: "Slot",
    schedule: { reference: `Schedule/${schedule.id}` },
    status: "free",
    start: "2021-09-13T09:00:00.000-08:00",
    end: "2021-09-13T09:09:00.000-08:00",
    extension: [
      {
        url: "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-deep-link",
        valueUrl:
          "https://prepmod.doh.wa.gov//appointment/en/client/registration?clinic_id=6320",
      },
    ],
    ...overrides,
  };
}

function createSmartManifest(apiHost, apiPath) {
  return {
    transactionTime: "2021-05-17T16:41:05.534Z",
    request: `${apiHost}${apiPath}`,
    output: [
      {
        type: "Location",
        url: `${apiHost}/test/locations.ndjson`,
      },
      {
        type: "Schedule",
        url: `${apiHost}/test/schedules.ndjson`,
      },
      {
        type: "Slot",
        url: `${apiHost}/test/slots.ndjson`,
      },
    ],
    error: [],
  };
}

module.exports = {
  createSmartLocation,
  createSmartSchedule,
  createSmartSlot,
  createSmartManifest,
};
