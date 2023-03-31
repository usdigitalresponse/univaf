const assert = require("assert").strict;
const got = require("got");
const { HttpApiError } = require("../../exceptions");
const { isTest } = require("../../config");
const { httpClient } = require("../../utils");

// States in which Rite Aid has stores.
const RITE_AID_STATES = [
  "CA",
  "CT",
  "DE",
  "ID",
  "MA",
  "MD",
  "MI",
  "NH",
  "NJ",
  "NV",
  "NY",
  "OH",
  "OR",
  "PA",
  "VA",
  "VT",
  "WA",
];

class RiteAidApiError extends HttpApiError {
  parse(response) {
    assert.equal(typeof response.body, "object");
    this.details = response.body;
    this.message = `${this.details.Status} ${this.details.ErrCde}: ${this.details.ErrMsg}`;
  }
}

const MINIMUM_403_RETRY_DELAY = isTest ? 0 : 30_000;

/**
 * A pre-configured Got instance with appropriate headers, etc. Crucially, this
 * client retries on 403 status codes (auth errors), since Rite Aid seems to
 * occasionally respond with those when our auth is actually valid.
 * @type {import("got").GotRequestFunction}
 */
const riteAidHttpClient = httpClient.extend({
  retry: {
    // This endpoint occasionally produces 403 status codes. We think this is
    // an anti-abuse measure, so we still want to retry, but fewer times and
    // with a longer than normal delay.
    statusCodes: [...got.default.defaults.options.retry.statusCodes, 403],
    calculateDelay({ attemptCount, error, computedValue }) {
      if (error.response?.statusCode === 403 && attemptCount < 2) {
        return Math.max(computedValue, MINIMUM_403_RETRY_DELAY);
      }
      return computedValue;
    },
  },
});

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

module.exports = {
  RITE_AID_STATES,
  RiteAidApiError,
  getExternalIds,
  getLocationName,
  riteAidHttpClient,
};
