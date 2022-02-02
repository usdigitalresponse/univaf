module.exports = {
  env: {
    es2021: true,
    node: true,
  },
  extends: "eslint:recommended",
  parserOptions: {
    ecmaVersion: 12,
    sourceType: "module",
  },
  rules: {
    "no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
      },
    ],
    "prefer-const": ["error", { destructuring: "all" }],
  },

  overrides: [
    {
      files: ["**/__mocks__/*.{js,ts}"],
      env: {
        jest: true,
      },
    },
  ],
};
