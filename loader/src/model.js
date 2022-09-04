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
  mobileClinic: "MOBILE_CLINIC",
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
  modernaBa4Ba5: "moderna_ba4_ba5",
  modernaAge6_11: "moderna_age_6_11",
  modernaAge0_5: "moderna_age_0_5",
  novavax: "novavax",
  pfizer: "pfizer",
  pfizerBa4Ba5: "pfizer_ba4_ba5",
  pfizerAge5_11: "pfizer_age_5_11",
  pfizerBa4Ba5Age5_11: "pfizer_ba4_ba5_age_5_11",
  pfizerAge0_4: "pfizer_age_0_4",
  sanofi: "sanofi",
};

/**
 * `VaccineProduct` values that are for children.
 * @readonly
 */
const PediatricVaccineProducts = new Set([
  VaccineProduct.pfizerAge5_11,
  VaccineProduct.modernaAge6_11,
]);

/**
 * `VaccineProduct` values that are for very young children.
 * @readonly
 */
const EarlyPediatricVaccineProducts = new Set([
  VaccineProduct.pfizerAge0_4,
  VaccineProduct.modernaAge0_5,
]);

module.exports = {
  Available,
  LocationType,
  VaccineProduct,
  PediatricVaccineProducts,
  EarlyPediatricVaccineProducts,
};
