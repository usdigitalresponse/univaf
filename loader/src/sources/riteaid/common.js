const assert = require("assert").strict;
const { HttpApiError } = require("../../exceptions");

class RiteAidApiError extends HttpApiError {
  parse(response) {
    assert.equal(typeof response.body, "object");
    this.details = response.body;
    this.message = `${this.details.Status} ${this.details.ErrCde}: ${this.details.ErrMsg}`;
  }
}

/**
 * Get the external IDs for a given Rite Aid store number. Rite Aid has a
 * number of sub-brands, and sometimes we need external IDs for both the whole
 * Rite Aid system and for the store's sub-brand. Luckily, the Rite-Aid wide ID
 * is always "<sub-brand-specific prefix(es)><sub-brand ID>", so we can
 * determine the sub-brand and sub-brand ID from the Rite Aid ID.
 * (Per discussion in 2021 with Rite Aid tech team.)
 *
 * For example, the Rite Aid ID "06958" is also the Bartell ID "58".
 *
 * @param {number|string} storeNumber The Rite Aid store number.
 * @returns {[string, string][]}
 */
function getExternalIds(storeNumber) {
  const numberString = storeNumber.toString();
  const result = [["rite_aid", numberString]];
  if (/69\d\d$/.test(numberString)) {
    result.push(["bartell", numberString.slice(-2)]);
  }
  return result;
}

/**
 * Get a human-friendly name for a Rite Aid location. If the store is part of a
 * known sub-brand, this uses the sub-brand's name instead of "Rite Aid".
 *
 * @param {[string, string][]} externalIds The store's external IDs
 * @returns {string}
 */
function getLocationName(externalIds) {
  let nonBrandName = "Rite Aid";

  for (const [system, value] of externalIds) {
    if (system === "bartell") {
      return `Bartell Drugs #${value}`;
    } else if (system === "rite_aid") {
      // External IDs can come in any order, and we want to prefer a sub-brand
      // name over a "Rite Aid" name, so store this as a fallback rather than
      // returning immediately.
      nonBrandName = `Rite Aid #${value}`;
    }
  }

  return nonBrandName;
}

module.exports = { RiteAidApiError, getExternalIds, getLocationName };
