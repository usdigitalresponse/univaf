const nock = require("nock");
const path = require("path");

const DEFAULT_NOCKBACK_PATH = path.join(__dirname, "fixtures", "nock");
let isNockBackInitialized = false;

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

  setupNockBack(mode, fixturePath) {
    // If nock.back has already been set up and we're not explicitly modifying
    // settings, don't reset everything.
    if (isNockBackInitialized && !mode && !fixturePath) return;

    nock.back.setMode(mode || "record");
    nock.back.fixtures = fixturePath || DEFAULT_NOCKBACK_PATH;
    isNockBackInitialized = true;
  },

  /**
   * Define a test function that uses recorded HTTP requests using Nock.back.
   * It returns an array with the test name and function so you can use it
   * conveniently with most test runners:
   *
   *     it(...withRecordedHttp("should do something", async () => {
   *       expect(true).toBe(true);
   *     }));
   *
   * The first time the test is run, actual HTTP requests will be allowed and
   * will be recorded to a file. Subsequent test runs will respond to requests
   * using the recorded responses, and new HTTP requests that do not match the
   * recordings will be disallowed. Delete the recording files to record new
   * responses if the upstream server has changed.
   *
   * @param {string} name The test name
   * @param {() => Promise} testFunction A Promise-returning test function
   * @returns {[string, () => Promise]}
   */
  withRecordedHttp(name, testFunction) {
    module.exports.setupNockBack();
    const wrapper = async () => {
      const fileName = `${name.replace(/\s+/g, "_").toLowerCase()}.json`;
      const { nockDone } = await nock.back(fileName);
      try {
        return await testFunction();
      } finally {
        nockDone();
        nock.cleanAll();
      }
    };
    return [name, wrapper];
  },
};
