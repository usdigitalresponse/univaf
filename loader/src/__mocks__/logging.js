"use strict";
const originalModule = jest.requireActual("../logging");

let messages = {};

class MockLogger extends originalModule.Logger {
  log(level, message, _context) {
    messages[level] ||= [];
    messages[level].push(message);
  }
}

module.exports = {
  ...originalModule,

  Logger: MockLogger,

  // Only for use in tests.
  mock: {
    get messages() {
      return messages;
    },

    clear() {
      messages = {};
    },
  },
};
