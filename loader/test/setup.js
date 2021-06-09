const nock = require("nock");

// Even though Jest does its best to isolate each test environment, some Nock
// calls (such as `nock.back.setMode()`, which enables and disables HTTP
// requests globally) can persist between tests.
// This resets all Nock settings after running each test file.
afterAll(() => {
  nock.restore();
});
