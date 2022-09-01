const { expect } = require("@jest/globals");

// TODO: this should probably be rewritten so it works with expect.extend(),
// and can be used like `expect.dateTimeString()`, but that means we can't
// leverage `expect.stringMatching()` here and it's more complex.
/**
 * Declare that a value should be a complete W3C-style ISO 8601 datetime
 * string. (e.g. "2021-03-13T05:53:20.123Z")
 * @returns {any}
 *
 * @example
 * const value = { time: "2021-03-13T05:53:20.123Z" };
 * expect(value).toEqual({ time: expectDatetimeString() })
 */
function expectDatetimeString() {
  return expect.stringMatching(
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(.\d+)?(Z|[+-]\d\d:?\d\d)$/
  );
}

module.exports = { expectDatetimeString };
