export type VaccineCode =
  | "astra_zeneca"
  | "jj"
  | "moderna"
  | "moderna_age_6_11"
  | "moderna_age_0_5"
  | "novavax"
  | "pfizer"
  | "pfizer_age_5_11"
  | "pfizer_age_0_4"
  | "sanofi";

// https://www.cdc.gov/vaccines/programs/iis/COVID-19-related-codes.html
export const CVX_CODES: { [code in VaccineCode]: number } = {
  astra_zeneca: 210,
  jj: 212,
  moderna: 207,
  moderna_age_6_11: 227,
  moderna_age_0_5: 228,
  novavax: 211,
  pfizer: 208,
  pfizer_age_5_11: 218,
  pfizer_age_0_4: 219,
  sanofi: 225,
};

export const PRODUCT_NAMES: { [code in VaccineCode]: string } = {
  astra_zeneca: "AstraZeneca",
  jj: "Johnson & Johnson",
  moderna: "Moderna",
  moderna_age_6_11: "Moderna Pediatric (Ages 6-11)",
  moderna_age_0_5: "Moderna Pediatric (Ages 0-5)",
  novavax: "NovaVax",
  pfizer: "Pfizer",
  pfizer_age_5_11: "Pfizer Pediatric (Ages 5-11)",
  pfizer_age_0_4: "Pfizer Pediatric (Ages 0-4)",
  sanofi: "Sanofi Pasteur",
};

export const MINIMUM_PRODUCT_AGES: { [code in VaccineCode]: number } = {
  astra_zeneca: 18 * 12,
  jj: 18 * 12,
  moderna: 12 * 12,
  moderna_age_6_11: 6 * 12,
  moderna_age_0_5: 6,
  novavax: 18 * 12,
  pfizer: 12 * 12,
  pfizer_age_5_11: 5 * 12,
  pfizer_age_0_4: 6,
  sanofi: 18 * 12,
};

export function minimumAgeForProducts(products: VaccineCode[]): number {
  return Math.min(...products.map((p) => MINIMUM_PRODUCT_AGES[p]));
}
