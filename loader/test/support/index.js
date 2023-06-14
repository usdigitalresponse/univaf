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

  /**
   * Convert the iterator from a source's `checkAvailability()` function to an
   * array of location objects. This discards any extra processing instructions
   * that might be emitted by `checkAvailability()` so you just get the
   * locations.
   * @param {AsyncIterator} resultsIterator
   * @returns {Promise<any[]>}
   */
  async getLocations(resultsIterator) {
    const locations = [];
    for await (const item of resultsIterator) {
      locations.push(Array.isArray(item) ? item[0] : item);
    }
    return locations;
  },

  /**
   * Split up a URL into two strings: a URL for the host and the path.
   * @param {string} url
   * @returns {[string, string]}
   */
  splitHostAndPath(url) {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname;
    parsedUrl.pathname = "";
    return [parsedUrl.href, path];
  },

  /**
   * Serialize a list of objects to Newline-Delimited JSON (ND-JSON).
   * @param {Array<any>} items
   * @returns {string}
   */
  toNdJson(items) {
    return items
      .map((item) => JSON.stringify(item))
      .map((item) => `${item}\n`)
      .join("");
  },
};
