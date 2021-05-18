const {
  convertToStandardSchema,
  createCannedUnavailableStore,
} = require("../src/sources/cvs/scraper");

const {
  CVS_CORPORATE_PHARMACY_PHONE_NUMBER,
  CVS_BOOKING_URL,
  getStoreCounty,
} = require("../src/sources/cvs/shared");

const { expectDatetimeString } = require("./support");

// const geocoding = require("../src/geocoding");
// const { dataSources, callsToAction } = require("../src/model");

// Sample CVS getIMZStore output when covid vaccine is available.
const sample = {
  responseMetaData: {
    statusCode: "0000",
    statusDesc: "Success",
    conversationID: "Id-574e3a60eb044945571b4a7d",
    refId: "Id-574e3a60eb044945571b4a7d",
  },
  responsePayloadData: {
    schedulerRefType: "IMZ_STORE",
    availableDates: [
      "2021-02-28",
      "2021-03-01",
      "2021-03-02",
      "2021-03-03",
      "2021-03-04",
      "2021-03-05",
      "2021-03-06",
    ],
    locations: [
      {
        StoreNumber: "04259",
        minuteClinicID: "0",
        opticalClinicID: "0",
        storeType: 0,
        pharmacyNCPDPProviderIdentifier: "3194622",
        addressLine: "1319 MAGIE AVENUE",
        addressCityDescriptionText: "UNION",
        addressState: "NJ",
        addressZipCode: "07083",
        addressCountry: "US",
        geographicLatitudePoint: "40.670900",
        geographicLongitudePoint: "-74.252500",
        indicatorStoreTwentyFourHoursOpen: "N",
        indicatorPrescriptionService: "Y",
        indicatorPhotoCenterService: "Y",
        indicatorOpticalService: "N",
        instorePickupService: "N",
        indicatorDriveThruService: "Y",
        indicatorPharmacyTwentyFourHoursOpen: "N",
        rxConvertedFlag: "Y",
        indicatorCircularConverted: "Y",
        indicatorH1N1FluShot: "N",
        indicatorRxFluFlag: "N",
        indicatorWicService: "N",
        snapIndicator: "Y",
        indicatorVaccineServiceSupport: "N",
        indicatorPneumoniaShotService: "N",
        indicatorWeeklyAd: "Y",
        indicatorCVSStore: "Y",
        indicatorStorePickup: "N",
        storeLocationTimeZone: "EST",
        storePhonenumber: "9083514940",
        pharmacyPhonenumber: "9083514940",
        storeHours: {
          DayHours: [
            {
              Day: "MON",
              Hours: "08:00 AM - 11:00 PM",
            },
            {
              Day: "TUE",
              Hours: "08:00 AM - 11:00 PM",
            },
            {
              Day: "WED",
              Hours: "08:00 AM - 11:00 PM",
            },
            {
              Day: "THU",
              Hours: "08:00 AM - 11:00 PM",
            },
            {
              Day: "FRI",
              Hours: "08:00 AM - 11:00 PM",
            },
            {
              Day: "SAT",
              Hours: "08:00 AM - 11:00 PM",
            },
            {
              Day: "SUN",
              Hours: "08:00 AM - 10:00 PM",
            },
          ],
        },
        pharmacyHours: {
          DayHours: [
            {
              Day: "MON",
              Hours: "08:00 AM - 08:00 PM",
            },
            {
              Day: "TUE",
              Hours: "08:00 AM - 08:00 PM",
            },
            {
              Day: "WED",
              Hours: "08:00 AM - 08:00 PM",
            },
            {
              Day: "THU",
              Hours: "08:00 AM - 08:00 PM",
            },
            {
              Day: "FRI",
              Hours: "08:00 AM - 08:00 PM",
            },
            {
              Day: "SAT",
              Hours: "10:00 AM - 06:00 PM",
            },
            {
              Day: "SUN",
              Hours: "10:00 AM - 05:00 PM",
            },
          ],
        },
        adVersionCdCurrent: "B",
        distance: "9.18",
        immunizationAvailability: {
          available: ["CVD"],
          unavailable: [],
        },
        schedulerRefId: "CVS_04259",
        imzAdditionalData: [
          {
            imzType: "CVD",
            availableDates: ["2021-03-02"],
          },
        ],
      },
    ],
  },
};

/**
 * Simple sanity test case to convert the CVS data schema to the scraper's schema.
 */
test("simple schema conversion", () => {
  const standardResult = convertToStandardSchema(sample);
  expect(Object.keys(standardResult).length).toBe(1);
  expect(standardResult["04259"]).toEqual({
    address_lines: ["1319 MAGIE AVENUE"],
    availability: {
      available: "YES",
      checked_at: expectDatetimeString(),
      source: "univaf-cvs-scraper",
      valid_at: expectDatetimeString(),
    },
    booking_phone: CVS_CORPORATE_PHARMACY_PHONE_NUMBER,
    booking_url: CVS_BOOKING_URL,
    city: "UNION",
    county: "Union",
    external_ids: {
      cvs: "04259",
    },
    id: "CVS:04259",
    location_type: "PHARMACY",
    name: "CVS #04259",
    position: null,
    postal_code: "07083",
    provider: "CVS",
    state: "NJ",
  });
});

test("correctness of unavailable slots", () => {
  const results = createCannedUnavailableStore();

  // There should be 350 stores in NJ that provides vaccine. This is reverse
  // engineered from CVS website and is subject to change. For now, this
  // case make sure we are roughly correct.
  expect(Object.keys(results).length).toBe(350);

  // Spot check to make sure we at least have the fields implemented correctly
  expect(results["00003"]).toEqual({
    address_lines: ["1497 Route 206 Tabernacle, NJ 08088"],
    availability: {
      available: "NO",
      checked_at: expectDatetimeString(),
      source: "univaf-cvs-scraper",
      valid_at: expectDatetimeString(),
    },
    booking_phone: CVS_CORPORATE_PHARMACY_PHONE_NUMBER,
    booking_url: CVS_BOOKING_URL,
    city: null,
    county: null,
    external_ids: {
      cvs: "00003",
    },
    id: "CVS:00003",
    location_type: "PHARMACY",
    name: "CVS #00003",
    position: null,
    postal_code: "08088",
    provider: "CVS",
    state: "NJ",
  });
});

// test("all stores have valid county data", () => {
//   const results = createCannedUnavailableStore();
//   Object.values(results).forEach((store) => {
//     expect(store.official.County).toBeTruthy();
//     if (!geocoding.ALL_COUNTIES.has(store.official.County)) {
//       console.log(
//         `Store ${store.name} has invalid county: ${store.official.County}`
//       );
//       throw new Error("invalid county");
//     }
//   });
// });

test("getStoreCounty handling of unknown store", () => {
  expect(getStoreCounty("nosuchstorenumber")).toBeUndefined();
});

test("convertToStandardSchema handling of unknown store", () => {
  const dummyResponse = {
    responseMetaData: {
      statusCode: "0000",
      statusDesc: "Success",
      conversationID: "Id-105920609b4d2cfc5baabe16",
      refId: "Id-105920609b4d2cfc5baabe16",
    },
    responsePayloadData: {
      schedulerRefType: "IMZ_STORE",
      availableDates: [
        "2021-02-08",
        "2021-02-09",
        "2021-02-10",
        "2021-02-11",
        "2021-02-12",
        "2021-02-13",
        "2021-02-14",
      ],
      locations: [
        {
          StoreNumber: "nosuchstore",
          addressLine: "1319 MAGIE AVENUE",
          addressCityDescriptionText: "UNION",
          addressState: "NJ",
          addressZipCode: "07083",
          addressCountry: "US",
        },
      ],
    },
  };

  const standardResult = convertToStandardSchema(dummyResponse);
  expect(Object.keys(standardResult).length).toBe(0);
});

test("convertToStandardSchema handling of out of state store", () => {
  const dummyResponse = {
    responseMetaData: {
      statusCode: "0000",
    },
    responsePayloadData: {
      schedulerRefType: "IMZ_STORE",
      locations: [
        {
          addressState: "CT",
        },
      ],
    },
  };

  const standardResult = convertToStandardSchema(dummyResponse);
  expect(Object.keys(standardResult).length).toBe(0);
});
