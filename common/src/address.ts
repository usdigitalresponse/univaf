import { ParseError } from "./exceptions";

const MULTIPLE_SPACE_PATTERN = /[\n\s]+/g;
const PUNCTUATION_PATTERN = /[.,;\-–—'"“”‘’`!()/\\]+/g;
const POSSESSIVE_PATTERN = /['’]s /g;

const ADDRESS_LINE_DELIMITER_PATTERN = /,|\n|\s-\s/g;
const ADDRESS_PATTERN =
  /^(.*),\s+([^,]+),\s+([A-Z]{2}),?\s+(\d+(-\d{4})?)\s*$/i;

// Common abbreviations in addresses and their expanded, full English form.
// These are used to match similar addresses. For example:
//   "600 Ocean Hwy" and "600 Ocean Highway"
// They're always used in lower-case text where punctuation has been removed.
// In some cases, the replacements *remove* the abbreviation entirely to enable
// better loose matching (usually for road types, like "road" vs. "street").
const ADDRESS_EXPANSIONS: [RegExp, string][] = [
  [/ i /g, " interstate "],
  [/ i-(\d+) /g, " interstate $1 "],
  [/ expy /g, " expressway "],
  [/ fwy /g, " freeway "],
  [/ hwy /g, " highway "],
  [/ (u s|us) /g, " "], // Frequently in "U.S. Highway / US Highway"
  [/ (s r|sr|st rt|state route|state road) /g, " route "],
  [/ rt /g, " route "],
  [/ (tpke?|pike) /g, " turnpike "],
  [/ ft /g, " fort "],
  [/ mt /g, " mount "],
  [/ mtn /g, " mountain "],
  [/ (is|isl|island) /g, " "],
  [/ n\s?w /g, " northwest "],
  [/ s\s?w /g, " southwest "],
  [/ n\s?e /g, " northeast "],
  [/ s\s?e /g, " southeast "],
  [/ n /g, " north "],
  [/ s /g, " south "],
  [/ e /g, " east "],
  [/ w /g, " west "],
  [/ ave? /g, " "],
  [/ avenue? /g, " "],
  [/ dr /g, " "],
  [/ drive /g, " "],
  [/ rd /g, " "],
  [/ road /g, " "],
  [/ st /g, " "],
  [/ street /g, " "],
  [/ saint /g, " "], // Unfortunately, this gets mixed in with st for street.
  [/ blvd /g, " "],
  [/ boulevard /g, " "],
  [/ ln /g, " "],
  [/ lane /g, " "],
  [/ cir /g, " "],
  [/ circle /g, " "],
  [/ ct /g, " "],
  [/ court /g, " "],
  [/ cor /g, " "],
  [/ corner /g, " "],
  [/ (cmn|common|commons) /g, " "],
  [/ ctr /g, " "],
  [/ center /g, " "],
  [/ pl /g, " "],
  [/ place /g, " "],
  [/ plz /g, " "],
  [/ plaza /g, " "],
  [/ pkw?y /g, " "],
  [/ parkway /g, " "],
  [/ cswy /g, " "],
  [/ causeway /g, " "],
  [/ byp /g, " "],
  [/ bypass /g, " "],
  [/ mall /g, " "],
  [/ (xing|crssng) /g, " "],
  [/ crossing /g, " "],
  [/ sq /g, " "],
  [/ square /g, " "],
  [/ trl? /g, " "],
  [/ trail /g, " "],
  [/ (twp|twsp|townsh(ip)?) /g, " "],
  [/ est(ate)? /g, " estates "],
  [/ vlg /g, " "],
  [/ village /g, " "],
  [/ (ste|suite|unit|apt|apartment) #?(\d+) /g, " $2 "],
  [/ (bld|bldg) #?(\d+) /g, " $2 "],
  [/ #?(\d+) /g, " $1 "],
  [/ (&|and) /g, " "],
  // "First" - "Tenth" are pretty common (this could obviously go farther).
  [/ first /g, " 1st "],
  [/ second /g, " 2nd "],
  [/ third /g, " 3rd "],
  [/ fourth /g, " 4th "],
  [/ fifth /g, " 5th "],
  [/ sixth /g, " 6th "],
  [/ seventh /g, " 7th "],
  [/ eighth /g, " 8th "],
  [/ ninth /g, " 9th "],
  [/ tenth /g, " 10th "],
];

/**
 * Simplify a text string (especially an address) as much as possible so that
 * it might match with a similar string from another source.
 */
export function matchable(text: string): string {
  return text
    .toLowerCase()
    .replace(POSSESSIVE_PATTERN, " ")
    .replace(PUNCTUATION_PATTERN, " ")
    .replace(MULTIPLE_SPACE_PATTERN, " ")
    .trim();
}

export function matchableAddress(
  text: string | string[],
  line: number = null
): string {
  let lines = Array.isArray(text)
    ? text
    : text.split(ADDRESS_LINE_DELIMITER_PATTERN);

  // If there are multiple lines and it looks like the first line is the name
  // of a place (rather than the street), drop the first line.
  if (lines.length > 1 && !/\d/.test(lines[0])) {
    lines = lines.slice(1);
  }

  if (line != null) {
    lines = lines.slice(line, line + 1);
  }

  let result = matchable(lines.join(" "));
  for (const [pattern, expansion] of ADDRESS_EXPANSIONS) {
    result = result.replace(pattern, expansion);
  }

  return result.replace(MULTIPLE_SPACE_PATTERN, " ").trim();
}

export interface UsAddress {
  lines: string[];
  city: string;
  state: string;
  zip: string | undefined;
}

/**
 * Parse a US-style address string.
 */
export function parseUsAddress(address: string): UsAddress {
  const match = address.match(ADDRESS_PATTERN);

  // Detect whether we have something formatted like an address, but with
  // obviously incorrect street/city/zip data, e.g. "., ., CA 90210".
  const invalidMatch =
    !match ||
    match[1].replace(PUNCTUATION_PATTERN, "") === "" ||
    match[2].replace(PUNCTUATION_PATTERN, "") === "" ||
    match[4].replace(PUNCTUATION_PATTERN, "") === "";
  if (invalidMatch) {
    throw new ParseError(`Could not parse address: "${address}"`);
  }

  const zip = match[4];
  if (zip.split("-")[0].length < 5) {
    throw new ParseError(`Invalid ZIP code in address: "${address}"`);
  }

  return {
    lines: [match[1]],
    city: match[2],
    state: match[3].toUpperCase(),
    zip,
  };
}

/**
 * Format a US ZIP code into its canonical 5-digit form (plus an optional
 * 4-digit suffix). This is useful since a lot of systems return ZIP codes
 * without leading zeroes.
 */
export function formatZipCode(zipCode: string | number): string {
  if (typeof zipCode === "number" && !Number.isInteger(zipCode)) {
    throw new SyntaxError(`ZIP code is not an integer: "${zipCode}"`);
  }

  const parts = zipCode.toString().split("-");
  if (parts.length > 2) {
    throw new SyntaxError(`ZIP code has multiple dashes: "${zipCode}"`);
  }

  let result = parts[0].padStart(5, "0");
  if (parts.length > 1) {
    result = `${result}-${parts[1].padStart(4, "0")}`;
  }
  return result;
}
