const nock = require("nock");
const path = require("path");

const DEFAULT_NOCKBACK_PATH = path.join(__dirname, "..", "fixtures", "nock");
const JEST_TEST_FUNCTIONS = ["test", "it", "fit", "xit"];

/**
 * Add `nock.back` support directly to Jest. Use recorded HTTP requests in a
 * test by calling `it.nock(testName, test)` instead of `it(name, test)`:
 *
 *     it.nock("should do something", async () => {
 *       expect(true).toBe(true);
 *     });
 *
 * This is very similar to the `jest-nock-back` package, but it resolves a few
 * issues and is compatible with Jest 27.
 */
function setupJestNockBack() {
  for (const jestTestFunction of JEST_TEST_FUNCTIONS) {
    global[jestTestFunction].nock = function (testName, options, testFunction) {
      global[jestTestFunction](testName, withNockBack(options, testFunction));
    };
  }

  // Even though Jest does its best to isolate each test environment, some Nock
  // calls (such as `nock.back.setMode()`, which enables and disables HTTP
  // requests globally) can persist between tests.
  // This resets all Nock settings after running each test file.
  afterAll(() => {
    nock.restore();
  });
}

function setupNockBack(fixturePath) {
  nock.back.fixtures = fixturePath || DEFAULT_NOCKBACK_PATH;
}

/**
 * Wrap a test function so that it uses Nock.back to record or replay recorded
 * responses for all the HTTP requests made as part of the test.
 *
 * Example usage:
 *
 *     it("should do something", withNockBack(async () => {
 *       expect(true).toBe(true);
 *     }));
 *
 * The first time the test is run, actual HTTP requests will be allowed and
 * will be recorded to a file. Subsequent test runs will respond to requests
 * using the recorded responses, and new HTTP requests that do not match the
 * recordings will be disallowed. Delete the recording files to record new
 * responses if the upstream server has changed.
 *
 * @param {any} [options] Options for handling recorded data.
 * @param {boolean|string[]} [options.ignoreQuery] Ignore querystrings or
 *        specific querystring parameters in requests. If `true`, then the
 *        entire querystring will be ignored. If a list of strings, only query
 *        parameters with those names will be ignored.
 * @param {(any) => void} [options.prepareScope] Function that will be called
 *        with each recorded request definition before installing them to be
 *        replayed. Use this, for example, to make recordings match when parts
 *        of a request (e.g. the path) are random or change from test run to
 *        test run.
 * @param {() => Promise} testFunction A Promise-returning test function
 * @returns {() => Promise}
 */
function withNockBack(options, testFunction) {
  if (typeof options === "function") {
    testFunction = options;
    options = {};
  }

  const originalMode = nock.back.currentMode;
  setupNockBack();
  nock.back.setMode("record");

  return async () => {
    const name = expect.getState().currentTestName;
    const fileName = `${name.replace(/\s+/g, "_").toLowerCase()}.json`;
    const { nockDone } = await nock.back(fileName, {
      before(scope) {
        if (options.ignoreQuery) {
          const filteringPath = (path) => {
            return removeQueryParameters(path, options.ignoreQuery);
          };
          scope.path = filteringPath(scope.path);
          scope.filteringPath = filteringPath;
        }
        if (options.prepareScope) {
          options.prepareScope(scope);
        }
      },
    });

    try {
      return await testFunction();
    } finally {
      nockDone();
      nock.cleanAll();
      // Reset the mode so it doesn't affect other, non-nock-back tests.
      nock.back.setMode(originalMode);
    }
  };
}

function removeQueryParameters(url, parameterNames) {
  return url.replace(/\?(.*)$/, (match, query) => {
    if (Array.isArray(parameterNames)) {
      const newParameters = query
        .split("&")
        .filter((parameter) => {
          const name = decodeURIComponent(parameter.split("=")[0]);
          return !parameterNames.includes(name);
        })
        .join("");
      return newParameters ? `?${newParameters}` : "";
    } else if (parameterNames) {
      return "";
    } else {
      return match;
    }
  });
}

module.exports = {
  setupJestNockBack,
  setupNockBack,
  withNockBack,
};
