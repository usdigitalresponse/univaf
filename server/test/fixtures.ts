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
