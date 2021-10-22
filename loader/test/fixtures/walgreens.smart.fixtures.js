const TestManifest = {
  transactionTime: "2021-10-20T05:00:00Z",
  request:
    "https://wbaschedulinglinks.blob.core.windows.net/fhir/$bulk-publish",
  output: [
    {
      type: "Location",
      url: "https://wbaschedulinglinks.blob.core.windows.net/fhir/locations.ndjson",
    },
    {
      type: "Schedule",
      url: "https://wbaschedulinglinks.blob.core.windows.net/fhir/schedules.ndjson",
    },
    {
      type: "Slot",
      url: "https://wbaschedulinglinks.blob.core.windows.net/fhir/Slot-abc.ndjson",
      extension: {
        state: ["AK"],
        currentAsOf: "2021-10-20T01:31:57.102Z",
      },
    },
  ],
  error: [],
};

const TestLocations = [
  {
    resourceType: "Location",
    id: "13656",
    name: "Walgreens #13656",
    telecom: [
      {
        system: "phone",
        value: "907-6448400",
      },
      {
        system: "url",
        value: "https://www.walgreens.com/locator/store/id=13656",
      },
    ],
    address: {
      line: ["725 E NORTHERN LIGHTS BLVD"],
      city: "Anchorage",
      state: "AK",
      postalCode: "99503",
      district: "ANCHORAGE",
    },
    position: {
      longitude: -149.86860492,
      latitude: 61.19594828,
    },
    identifier: [
      {
        system: "https://cdc.gov/vaccines/programs/vtrcks",
        value: "unknown VTrckS pin for 13656",
      },
      {
        system: "http://hl7.org/fhir/sid/us-npi",
        value: "1598055964",
      },
      {
        system: "https://walgreens.com",
        value: "13656",
      },
    ],
  },
];

const TestSchedules = [
  {
    resourceType: "Schedule",
    id: "13656",
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
    actor: [{ reference: "Location/13656" }],
  },
];

const TestSlots = [
  {
    resourceType: "Slot",
    status: "free",
    id: "13656",
    schedule: {
      reference: "Schedule/13656",
    },
    start: "2021-10-21T00:00:00.000Z",
    end: "2021-10-26T00:00:00.000Z",
    extension: [
      {
        url: "http://fhir-registry.smarthealthit.org/StructureDefinition/slot-capacity",
        valueInteger: 5,
      },
      {
        url: "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-deep-link",
        valueUrl: "https://www.walgreens.com/findcare/vaccination/covid-19",
      },
      {
        url: "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-phone",
        valueString: "1-800-925-4733",
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
