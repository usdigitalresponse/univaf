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

// FIXME: temporary mappings now that we have common code.
const {
  VACCINE_PRODUCTS: VaccineProduct,
  PEDIATRIC_PRODUCTS: PediatricVaccineProducts,
  EARLY_PEDIATRIC_PRODUCTS: EarlyPediatricVaccineProducts,
} = require("univaf-common/vaccines");

module.exports = {
  Available,
  LocationType,
  VaccineProduct,
  PediatricVaccineProducts,
  EarlyPediatricVaccineProducts,
};
