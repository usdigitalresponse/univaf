/**
 * Core types and tooling for vaccine types/products.
 */

/**
 * UNIVAF vaccine product codes. These are the way we refer to different
 * vaccines internally, and are the codes that show up in the `products` fields
 * of the API.
 */
export type VaccineCode =
  | "astra_zeneca"
  | "jj"
  | "moderna"
  | "moderna_ba4_ba5"
  | "moderna_age_6_11"
  | "moderna_ba4_ba5_age_6_11"
  | "moderna_age_0_5"
  | "novavax"
  | "pfizer"
  | "pfizer_ba4_ba5"
  | "pfizer_age_5_11"
  | "pfizer_ba4_ba5_age_5_11"
  | "pfizer_age_0_4"
  | "sanofi";

/**
 * Helper enum object for JS code (rather than TS code) to use and reference
 * Where things might otherwise just be typed as {VaccineCode}.
 * This is an object rather than an actual enum so we can the values' type.
 */
export const VACCINE_PRODUCTS = {
  astraZeneca: "astra_zeneca",
  janssen: "jj",
  moderna: "moderna",
  modernaBa4Ba5: "moderna_ba4_ba5",
  modernaAge6_11: "moderna_age_6_11",
  modernaBa4Ba5Age6_11: "moderna_ba4_ba5_age_6_11",
  modernaAge0_5: "moderna_age_0_5",
  novavax: "novavax",
  pfizer: "pfizer",
  pfizerBa4Ba5: "pfizer_ba4_ba5",
  pfizerAge5_11: "pfizer_age_5_11",
  pfizerBa4Ba5Age5_11: "pfizer_ba4_ba5_age_5_11",
  pfizerAge0_4: "pfizer_age_0_4",
  sanofi: "sanofi",
} satisfies { [index: string]: VaccineCode };

/**
 * Vaccine codes that are for children.
 * @readonly
 */
export const PEDIATRIC_PRODUCTS = new Set([
  "pfizer_age_5_11",
  "moderna_age_6_11",
]) satisfies Set<VaccineCode>;

/**
 * Vaccine codes that are for very young children.
 */
export const EARLY_PEDIATRIC_PRODUCTS = new Set([
  "pfizer_age_0_4",
  "moderna_age_0_5",
]) satisfies Set<VaccineCode>;

/**
 * CVX codes issued by CDC for vaccine products.
 * See: https://www.cdc.gov/vaccines/programs/iis/COVID-19-related-codes.html
 */
export const CVX_CODES: { [code in VaccineCode]: number } = {
  astra_zeneca: 210,
  jj: 212,
  moderna: 207,
  moderna_ba4_ba5: 229,
  moderna_age_6_11: 227,
  moderna_ba4_ba5_age_6_11: 229,
  moderna_age_0_5: 228,
  novavax: 211,
  pfizer: 208,
  pfizer_ba4_ba5: 300,
  pfizer_age_5_11: 218,
  pfizer_ba4_ba5_age_5_11: 301,
  pfizer_age_0_4: 219,
  sanofi: 225,
};

/** Human-readable names for vaccine products. */
export const PRODUCT_NAMES: { [code in VaccineCode]: string } = {
  astra_zeneca: "AstraZeneca",
  jj: "Johnson & Johnson",
  moderna: "Moderna",
  moderna_ba4_ba5: "Moderna (for Omicron BA.4/BA.5)",
  moderna_age_6_11: "Moderna Pediatric (Ages 6-11)",
  moderna_ba4_ba5_age_6_11:
    "Moderna Pediatric (Ages 6-11, for Omicron BA.4/BA.5)",
  moderna_age_0_5: "Moderna Pediatric (Ages 0-5)",
  novavax: "NovaVax",
  pfizer: "Pfizer",
  pfizer_ba4_ba5: "Pfizer (for Omicron BA.4/BA.5)",
  pfizer_age_5_11: "Pfizer Pediatric (Ages 5-11)",
  pfizer_ba4_ba5_age_5_11:
    "Pfizer Pediatric (Ages 5-11, for Omicron BA.4/BA.5)",
  pfizer_age_0_4: "Pfizer Pediatric (Ages 0-4)",
  sanofi: "Sanofi Pasteur",
};

/** Minimum authorized age (in months) for vaccine products. */
export const MINIMUM_PRODUCT_AGES: { [code in VaccineCode]: number } = {
  astra_zeneca: 18 * 12,
  jj: 18 * 12,
  moderna: 12 * 12,
  // NOTE: as of 2022-09-08, moderna_ba4_ba5 is formulated for 6+ years, but
  // only authorized for 18+.
  moderna_ba4_ba5: 18 * 12,
  moderna_age_6_11: 6 * 12,
  moderna_ba4_ba5_age_6_11: 6 * 12,
  moderna_age_0_5: 6,
  novavax: 18 * 12,
  pfizer: 12 * 12,
  pfizer_ba4_ba5: 12 * 12,
  pfizer_age_5_11: 5 * 12,
  pfizer_ba4_ba5_age_5_11: 5 * 12,
  pfizer_age_0_4: 6,
  sanofi: 18 * 12,
};

/**
 * Given an array of products, find the minimum patient age among them.
 */
export function minimumAgeForProducts(products: VaccineCode[]): number {
  return Math.min(...products.map((p) => MINIMUM_PRODUCT_AGES[p]));
}
