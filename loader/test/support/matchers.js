const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const addInstanceof = require("ajv-keywords/dist/keywords/instanceof");

const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);
addInstanceof(ajv);
const compiledSchemas = new Map();

/**
 * Expect that an object matches a given JSON Schema.
 */
function toMatchSchema(received, schema) {
  // Compilation is expensive, so cache validator functions.
  let validator = compiledSchemas.get(schema);
  if (!validator) {
    validator = ajv.compile(schema);
    compiledSchemas.set(schema, validator);
  }

  const pass = validator(received);
  return {
    pass,
    message() {
      return (validator.errors || [])
        .map((error) => `${error.instancePath} ${error.message}`)
        .join("\n");
    },
  };
}

/**
 * Expect that every item in an array matches a given JSON Schema.
 */
function toContainItemsMatchingSchema(received, schema) {
  return toMatchSchema(received, {
    type: "array",
    items: schema,
  });
}

module.exports = {
  toMatchSchema,
  toContainItemsMatchingSchema,
};
