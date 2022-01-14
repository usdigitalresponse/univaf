const Ajv = require("ajv");
const addFormats = require("ajv-formats");

class SchemaError extends Error {
  static formatAjvError(error) {
    const value = JSON.stringify(error.data) || "undefined";
    return `${error.instancePath} ${error.message} (value: \`${value}\`)`;
  }

  constructor(errors, data, message = null) {
    message = message || "Data did not match schema";
    const details = errors.map(SchemaError.formatAjvError);
    const detailMessage = details.map((detail) => `  ${detail}`).join("\n");

    super(`${message} - ${errors.length} errors:\n${detailMessage}`);
    this.data = data;
    this.errors = details;
  }
}

let singletonValidator;

/**
 * Get a configured instance of AJV.
 * @returns {Ajv}
 */
function getValidator() {
  if (!singletonValidator) {
    singletonValidator = new Ajv({ allErrors: true, verbose: true });
    addFormats(singletonValidator);
  }

  return singletonValidator;
}

/**
 * Assert that a data object matches a schema. If it doesn't match, this will
 * throw a `SchemaError`.
 * @param {any} schema The schema to validate against.
 * @param {any} data The data object to validate.
 * @param {string} [message] Description of the assertion.
 */
function assertSchema(schema, data, message) {
  const validator = getValidator();
  if (!validator.validate(schema, data)) {
    throw new SchemaError(validator.errors, data, message);
  }
}

module.exports = {
  SchemaError,
  getValidator,
  assertSchema,
};
