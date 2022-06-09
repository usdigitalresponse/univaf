/**
 * Albertons locations that appear to be real, but are not listed on any
 * Albertsons or Albertsons sub-brand website. We've seen these locations in
 * appointment data and can't find listings for them, but Google streetview and
 * other sources suggest they are in fact real.
 *
 * We should be careful with these, and remove them if we later learn they are
 * incorrect.
 *
 * The locations here are hand-coded, but the format is meant to match the
 * scraped data in `stores-scraped.json` (which comes from
 * `scrape-albertsons-stores.js`).
 */
module.exports = [
  {
    // See on streetview: https://www.google.com/maps/place/728+N+H+St,+Lompoc,+CA+93436/@34.6496795,-120.4595305,18z
    // It seems like this location might be closed, but is still showing up in
    // appointment data. Google now lists it with an individual pharmacist's
    // name, so maybe they are doing vaccinations there just for COVID?
    name: "Vons",
    c_parentEntityID: "1738",
    address: {
      city: "Lompoc",
      countryCode: "US",
      extraDescription: null,
      line1: "729 North H St.",
      postalCode: "93436",
      region: "CA",
      sublocality: null,
    },
    geocodedCoordinate: {
      lat: 34.6585501,
      long: -120.4575291,
    },
    mainPhone: null,
    timezone: "America/Los_Angeles",
  },
  {
    // See on streetview: https://www.google.com/maps/place/101+N+Washington+St,+Seymour,+TX+76380/@33.5881333,-99.2641639,17z
    // There is another United Supermarket several blocks away which is listed,
    // but this appears to be a real, separate location.
    name: "United Supermarkets",
    c_parentEntityID: "573",
    address: {
      city: "Seymour",
      countryCode: "US",
      extraDescription: null,
      line1: "101 N. Washington",
      postalCode: "76380",
      region: "TX",
      sublocality: null,
    },
    geocodedCoordinate: {
      lat: 33.5881289,
      long: -99.2641639,
    },
    mainPhone: null,
    timezone: "America/Chicago",
  },
];
