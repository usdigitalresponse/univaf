const { LocationType } = require("../../model");

/**
 * @typedef {Object} Brand
 * @property {string} provider_id Value to use as the location's "provider".
 * @property {string} key Unique name of brand to use in property names/values.
 * @property {string} name Human-readable name of brand.
 * @property {string} bookingApiName Unique name of brand use in Albertsons's
 *           booking website's XHR API.
 * @property {string} url URL to book vaccine appointments at.
 * @property {boolean} isNotAStore True if the location is not a retail store.
 * @property {{ test: (name: string) => boolean }} pattern Expression to match
 *           the brand name from a human-readable store name or address.
 */

const BASE_BRAND = {
  provider_id: "albertsons",
  key: "albertsons",
  name: "Albertsons",
  bookingApiName: "",
  url: "https://www.albertsons.com/pharmacy/covid-19.html",
  isNotAStore: false,
  pattern: { test: (_name) => false },
};

/** @type {Brand[]} */
const BRANDS = [
  {
    ...BASE_BRAND,
    key: "acme",
    name: "Acme",
    pattern: /Acme/i,
    bookingApiName: "ACME",
  },
  {
    ...BASE_BRAND,
    key: "albertsons_market",
    name: "Albertsons Market",
    pattern: /Albertsons Market/i,
    bookingApiName: "ALBERTSONS MARKET",
  },
  {
    ...BASE_BRAND,
    key: "albertsons",
    name: "Albertsons",
    pattern: /Albertsons|\bABS\s/i,
    bookingApiName: "ALBERTSONS",
  },
  {
    ...BASE_BRAND,
    key: "amigos",
    name: "Amigos",
    pattern: /Amigos/i,
  },
  {
    ...BASE_BRAND,
    key: "carrs",
    name: "Carrs",
    pattern: /Carrs/i,
    bookingApiName: "CARRS",
  },
  {
    ...BASE_BRAND,
    key: "haggen",
    name: "Haggen",
    url: "https://www.haggen.com/explore-our-departments/pharmacy/covid-19/",
    pattern: /Haggen/i,
    bookingApiName: "HAGGEN",
  },
  {
    ...BASE_BRAND,
    key: "jewelosco",
    name: "Jewel-Osco",
    pattern: /Jewel.Osco/i,
    bookingApiName: "JEWEL-OSCO",
  },
  {
    ...BASE_BRAND,
    key: "luckys",
    name: "Lucky",
    pattern: /Lucky/i,
    bookingApiName: "LUCKY'S",
  },
  {
    ...BASE_BRAND,
    key: "market_street",
    name: "Market Street",
    pattern: /Market Street/i,
    bookingApiName: "MARKET STREET",
  },
  {
    ...BASE_BRAND,
    key: "pak_n_save",
    name: "Pak 'n Save",
    pattern: /Pak '?N Save/i,
    bookingApiName: "PAK N SAVE",
  },
  {
    key: "pavilions",
    name: "Pavilions",
    pattern: /Pavilions/i,
    bookingApiName: "PAVILIONS",
  },
  {
    ...BASE_BRAND,
    key: "randalls_pharmacy",
    name: "Randalls Pharmacy",
    pattern: /Randalls Pharmacy/i,
  },
  {
    ...BASE_BRAND,
    key: "randalls",
    name: "Randalls",
    pattern: /Randalls/i,
    bookingApiName: "RANDALLS",
  },
  {
    ...BASE_BRAND,
    key: "safeway",
    name: "Safeway",
    url: "https://www.safeway.com/pharmacy/covid-19.html",
    pattern: /Safeway/i,
    bookingApiName: "SAFEWAY",
  },
  {
    ...BASE_BRAND,
    key: "sav_on",
    name: "Sav-On Pharmacy",
    pattern: /Sav-?On/i,
  },
  {
    ...BASE_BRAND,
    key: "shaws",
    name: "Shaw's",
    pattern: /Shaw/i,
    bookingApiName: "SHAWS",
  },
  {
    ...BASE_BRAND,
    key: "star_market",
    name: "Star Market",
    pattern: /Star Market/i,
    bookingApiName: "STAR MARKET",
  },
  {
    ...BASE_BRAND,
    key: "tom_thumb",
    name: "Tom Thumb",
    pattern: /Tom Thumb/i,
    bookingApiName: "TOM THUMB",
  },
  {
    ...BASE_BRAND,
    key: "united",
    name: "United Supermarkets",
    // "United" is really common in other names, so we need to a more complex
    // pattern than most other stores.
    pattern: /United (#?\d|\w+market)/i,
    bookingApiName: "UNITED",
  },
  {
    ...BASE_BRAND,
    key: "vons",
    name: "Vons",
    pattern: /Vons/i,
    bookingApiName: "VONS",
  },
  {
    ...BASE_BRAND,
    key: "albertsons_corporate",
    name: "ALB Corporate Office",
    isNotAStore: true,
    pattern: /Corporate Office/i,
  },
  // Albertsons is now operating some clinics outside its actual stores, and
  // this is meant to cover those. The names don't follow any real pattern, so
  // we do our best by matching anything that doesn't look like some words
  // followed by a number (since that usually indicates a store of some sort).
  {
    ...BASE_BRAND,
    key: "community_clinic",
    name: "Community Clinic",
    locationType: LocationType.clinic,
    isNotAStore: true,
    pattern: {
      test: (name) => {
        // Some locations need explicit support because they look like "name
        // followed by store number", which we explicitly disallow for community
        // clinics in the first pattern.
        return (
          !/(\w+\s+#?\d+$)|^\d+\s/.test(name) ||
          /^teamsters local/i.test(name) ||
          /^chicago fire department/i.test(name)
        );
      },
    },
  },
];

module.exports = { BRANDS };
