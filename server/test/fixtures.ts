/**
 * Basic fixtures for use in tests. The objects here are not automatically
 * added to the database, but are just used in various places to insert and
 * query against, or to customize for multiple inserts, etc.
 */

import { Availability } from "../src/interfaces";

export const TestLocation = {
  id: "DB053F3A-2DBD-416D-BB34-36579809CC87",
  external_ids: {
    njiis: "nj1234",
    vtrcks: "456",
  },
  provider: "NJVSS",
  location_type: "mass_vax",
  name: "Gloucester County Megasite",
  address_lines: [
    "Rowan College of South Jersey",
    "1400 Tanyard Road",
    "Sewell",
  ],
  state: "NJ",
  county: "Gloucester",
  booking_phone: "",
  booking_url: "https://covidvaccine.nj.gov/",
  description: "This location is available for 1st and 2nd dose recipients.",
  requires_waitlist: true,
  is_public: true,
  meta: {
    something: "some value",
  },
  availability: {
    source: "NJVSS Export",
    checked_at: "2021-05-14T06:45:51.273Z",
    valid_at: "2021-05-14T06:45:51.273Z",
    available: Availability.YES,
    is_public: true,
    meta: {},
  },
};

export const TestLocation2 = {
  id: "0cd44819-4761-45f3-8544-cf1793310d31",
  external_ids: {
    njiis: "nj5678",
    vtrcks: "789",
    rite_aid: "576",
    univaf_v0: "rite_aid:576",
  },
  provider: "RiteAid",
  location_type: "PHARMACY",
  name: "Rite Aid #576",
  address_lines: ["605 North Colony Road"],
  city: "Wallingford",
  state: "CT",
  postal_code: "06492-3109",
  info_phone: "(203) 265-3600",
  info_url: "https://www.riteaid.com/covid-19",
  booking_phone: "(203) 265-3600",
  booking_url: "https://www.riteaid.com/pharmacy/covid-qualifier",
  requires_waitlist: false,
  created_at: "2021-04-27T20:20:32.498Z",
  updated_at: "2021-04-27T20:20:32.498Z",
  availability: {
    source: "rite-aid-api",
    valid_at: "2021-05-15T02:31:44+00:00",
    checked_at: "2021-05-15T02:32:14.449+00:00",
    available: "YES",
    meta: {},
    available_count: 191,
  },
};
