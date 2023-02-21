"use strict";
const originalModule = jest.requireActual("../utils");

const warningLoggers = {};
let warnings = [];

const mock = {
  ...originalModule,

  createWarningLogger(prefix) {
    warningLoggers[prefix] = jest.fn((message) => warnings.push(message));
    return warningLoggers[prefix];
  },

  // Only for use in tests: get mock function for a logger.
  __getWarningLogger(prefix) {
    prefix = prefix || Object.keys(warningLoggers).pop();
    return warningLoggers[prefix];
  },

  // Only for use in tests: get a list of all warnings that were logged.
  __getWarnings() {
    return warnings;
  },

  __mockClear() {
    warnings = [];
  },
};

module.exports = mock;
