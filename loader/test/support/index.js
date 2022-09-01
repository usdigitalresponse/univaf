module.exports = {
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
