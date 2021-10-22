const TestManifest = {
  transactionTime: "2021-10-22T00:00:02+00:00",
  request:
    "https://api.kroger.com/v1/health-wellness/schedules/vaccines/$bulk-publish",
  output: [
    {
      type: "Schedule",
      url: "https://api.kroger.com/v1/health-wellness/schedules/vaccines/schedules.ndjson",
      extension: null,
    },
    {
      type: "Location",
      url: "https://api.kroger.com/v1/health-wellness/schedules/vaccines/locations.ndjson",
      extension: null,
    },
    {
      type: "Slot",
      url: "https://api.kroger.com/v1/health-wellness/schedules/vaccines/slot_AK.ndjson",
      extension: {
        state: ["AK"],
      },
    },
    {
      type: "Slot",
      url: "https://api.kroger.com/v1/health-wellness/schedules/vaccines/slot_AL.ndjson",
      extension: {
        state: ["AL"],
      },
    },
  ],
  error: [],
};

const TestLocations = [
  {
    resourceType: "Location",
    id: "70100011",
    identifier: [
      {
        system: "https://cdc.gov/vaccines/programs/vtrcks",
        value: "40173465",
      },
    ],
    name: "Fred Meyer Pharmacy #70100011",
    telecom: [
      {
        system: "phone",
        value: "9072649600",
      },
      {
        system: "url",
        value: "https://www.fredmeyer.com/rx/landing-page",
      },
    ],
    address: {
      line: ["1000 E Northern Lights Blvd"],
      city: "Anchorage",
      state: "AK",
      postalCode: "99508",
    },
  },
];

const TestSchedules = [
  {
    resourceType: "Schedule",
    id: "70100011",
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
    actor: [{ reference: "Location/70100011" }],
  },
];

const TestSlots = [
  {
    id: "18296",
    resourceType: "Slot",
    schedule: {
      reference: "Schedule/70100011",
    },
    status: "free",
    start: "2021-10-22T09:00:00-08:00",
    end: "2021-10-22T19:45:00-08:00",
    extension: [
      {
        url: "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-deep-link",
        valueUrl: "https://www.fredmeyer.com/rx/covid-eligibility",
      },
    ],
  },
  {
    id: "18307",
    resourceType: "Slot",
    schedule: {
      reference: "Schedule/70100011",
    },
    status: "busy",
    start: "2021-10-23T01:00:00-08:00",
    end: "2021-10-23T21:00:00-08:00",
    extension: [
      {
        url: "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-deep-link",
        valueUrl: "https://www.fredmeyer.com/rx/covid-eligibility",
      },
    ],
  },
  {
    id: "18318",
    resourceType: "Slot",
    schedule: {
      reference: "Schedule/70100011",
    },
    status: "busy",
    start: "2021-10-24T01:00:00-08:00",
    end: "2021-10-24T21:00:00-08:00",
    extension: [
      {
        url: "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-deep-link",
        valueUrl: "https://www.fredmeyer.com/rx/covid-eligibility",
      },
    ],
  },
  {
    id: "18329",
    resourceType: "Slot",
    schedule: {
      reference: "Schedule/70100011",
    },
    status: "free",
    start: "2021-10-25T09:00:00-08:00",
    end: "2021-10-25T19:45:00-08:00",
    extension: [
      {
        url: "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-deep-link",
        valueUrl: "https://www.fredmeyer.com/rx/covid-eligibility",
      },
    ],
  },
];

module.exports = {
  TestManifest,
  TestLocations,
  TestSchedules,
  TestSlots,
};
