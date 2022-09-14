module.exports = {
  globals: {},
  moduleFileExtensions: ["ts", "js"],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
      },
    ],
  },
  testMatch: ["**/test/**/*.test.(ts|js)", "!**/dist/test/**/*"],
  testEnvironment: "node",
  reporters: ["default", "github-actions"],
  coverageReporters: ["text", "html"],
  globalSetup: "<rootDir>/test/support/globalSetup.ts",
};
