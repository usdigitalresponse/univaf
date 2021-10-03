const TestManifest = {
  transactionTime: "2021-05-17T16:41:05.534Z",
  request: "https://www.cvs.com/immunizations/inventory/data/$bulk-publish",
  output: [
    {
      type: "Location",
      url: "https://www.cvs.com/immunizations/inventory/data/location.ndjson",
    },
    {
      type: "Schedule",
      url: "https://www.cvs.com/immunizations/inventory/data/schedule.ndjson",
    },
    {
      type: "Slot",
      url: "https://www.cvs.com/immunizations/inventory/data/slot.ndjson",
    },
  ],
  error: [],
};

const TestLocations = [
  {
    resourceType: "Location",
    id: "2004",
    identifier: [
      {
        system: "https://cdc.gov/vaccines/programs/vtrcks",
        value: "CV1002004",
      },
    ],
    name: "CVS Pharmacy in ALEXANDRIA, VA",
    telecom: [
      {
        system: "phone",
        value: "888-607-4287",
      },
      {
        system: "url",
        value:
          "https://www.cvs.com/immunizations/covid-19-vaccine?cid=oc_vacfnd_cvd",
      },
    ],
    address: {
      line: ["3117 LOCKHEED BLVD."],
      city: "ALEXANDRIA",
      state: "VA",
      postalCode: "22306",
    },
  },
];

const TestSchedules = [
  {
    resourceType: "Schedule",
    id: "C28A418A13AC2251E0536CF0D90AF81D",
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
              "http://fhir-registry.smarthealthit.org/StructureDefinition/vaccine-dose",
            code: "covid19-immunization",
            display: "COVID-19 Immunization Appointment",
          },
        ],
      },
    ],
    actor: [
      {
        reference: "Location/2004",
      },
    ],
  },
];

const TestSlots = [
  {
    resourceType: "Slot",
    id: "C28A418A39B52251E0536CF0D90AF81D",
    schedule: {
      reference: "Schedule/C28A418A13AC2251E0536CF0D90AF81D",
    },
    status: "busy",
    start: "2021-05-18T09:00:00.000Z",
    end: "2021-05-18T19:00:00.000Z",
    extension: [
      {
        url: "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-deep-link",
        valueUrl:
          "https://www.cvs.com/immunizations/covid-19-vaccine?cid=oc_vacfnd_cvd",
      },
      {
        url: "http://fhir-registry.smarthealthit.org/StructureDefinition/slot-capacity",
        valueInteger: "0",
      },
    ],
  },
  {
    resourceType: "Slot",
    id: "C28A418A39B62251E0536CF0D90AF81D",
    schedule: {
      reference: "Schedule/C28A418A13AC2251E0536CF0D90AF81D",
    },
    status: "free",
    start: "2021-05-19T09:00:00.000Z",
    end: "2021-05-19T19:00:00.000Z",
    extension: [
      {
        url: "http://fhir-registry.smarthealthit.org/StructureDefinition/booking-deep-link",
        valueUrl:
          "https://www.cvs.com/immunizations/covid-19-vaccine?cid=oc_vacfnd_cvd",
      },
      {
        url: "http://fhir-registry.smarthealthit.org/StructureDefinition/slot-capacity",
        valueInteger: "1",
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
