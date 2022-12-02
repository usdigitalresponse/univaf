module.exports = {
  env: {
    es2021: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 12,
    sourceType: "module",
  },
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],

  rules: {
    "prefer-const": ["error", { destructuring: "all" }],
    // Will be part of eslint:recommended in ESlint 9, so we can remove then.
    "no-new-native-nonconstructor": ["error"],

    // TypeScript-focused rules -----------------------------------------------

    // There is a TypeScript-enhanced version of no-unused-vars; use it instead
    // of the built-in. (It will still check .js files, too.)
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
      },
    ],

    "@typescript-eslint/explicit-module-boundary-types": [
      "warn",
      {
        allowArgumentsExplicitlyTypedAsAny: true,
      },
    ],
    "@typescript-eslint/no-empty-function": "off",
    "@typescript-eslint/no-explicit-any": "off",

    // We have some plain JS in the codebase that we don't want a build step
    // for; they need `require()` support.
    "@typescript-eslint/no-var-requires": "off",
  },

  ignorePatterns: ["node_modules", "dist", "coverage", "scratch.*"],

  overrides: [
    {
      files: ["**/__mocks__/*.{js,ts}"],
      env: {
        jest: true,
      },
    },
  ],
};
