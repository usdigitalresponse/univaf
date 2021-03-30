module.exports = {
  /**
   * Declare that a value should be a complete W3C-style ISO 8601 datetime
   * string. (e.g. "2021-03-13T05:53:20.123Z")
   *
   * @example
   * const value = { time: "2021-03-13T05:53:20.123Z" };
   * expect(value).toEqual({ time: expectDatetimeString() })
   */
  expectDatetimeString() {
    return expect.stringMatching(
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(.\d+)?(Z|[+-]\d\d:?\d\d)$/
    );
  },
};
