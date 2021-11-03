/**
 * Vaccine availability at a site should always be one of these values.
 * @readonly
 * @enum {string}
 */
const Available = {
  /** Vaccines are available! */
  yes: "YES",
  /** We got good data, but can't clearly tell availability from it. */
  unknown: "UNKNOWN",
  /** Vaccines are not available. :( */
  no: "NO",
};

/**
 * Type of location where vaccines are available.
 * @readonly
 * @enum {string}
 */
const LocationType = {
  pharmacy: "PHARMACY",
  massVax: "MASS_VAX",
  clinic: "CLINIC",
};

/**
 * Types of vaccine products a location might offer.
 * @readonly
 * @enum {string}
 */
const VaccineProduct = {
  astraZeneca: "astra_zeneca",
  janssen: "jj",
  moderna: "moderna",
  novavax: "novavax",
  pfizer: "pfizer",
  pfizerAge5_11: "pfizer_age_5_11",
  pfizerAge2_4: "pfizer_age_2_4",
  pfizerPediatric: "pfizer_pediatric",
};

module.exports = {
  Available,
  LocationType,
  VaccineProduct,
};
