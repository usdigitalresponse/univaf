module.exports = {
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig.json",
    },
  },
  moduleFileExtensions: ["ts", "js"],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
  testMatch: ["**/test/**/*.test.(ts|js)"],
  testEnvironment: "node",
  reporters: ["default", "github-actions"],
  coverageReporters: ["text", "html"],
  globalSetup: "<rootDir>/test/globalSetup.ts",
};
