const { BaseError } = require("univaf-common/exceptions");

/**
 * @typedef {object} HttpResponse
 * @property {number} statusCode
 * @property {string} [statusMessage]
 * @property {any} body
 */

/**
 * An error from an HTTP response.
 */
class HttpApiError extends BaseError {
  /** @property {number} statusCode The HTTP status code of the response. */

  /**
   * Create an error object for a bad response from an API.
   * @param {HttpResponse} response
   */
  constructor(response, { cause = null } = {}) {
    super(`${response.statusCode} ${response.statusMessage}`, { cause });
    this.statusCode = response.statusCode;
    try {
      this.parse(response);
    } catch (_) {
      this.details = { body: response.body };
    }
  }

  /**
   * Parse an HTTP response for error information and set relevant properties
   * on the error instance. This should be overridden by subclasses to handle
   * different error formats.
   *
   * It's safe for this to raise an exception (it will be handled and a more
   * generic error message will be set).
   *
   * @param {HttpResponse} response An HTTP response with error info.
   */
  parse(response) {
    this.details = JSON.parse(response.body);
    this.message = this.details.error.message;
  }
}

/**
 * Represents errors received from a GraphQL query result.
 */
class GraphQlError extends HttpApiError {
  /**
   * @property {any[]} codes If the GraphQL API returned error codes, the code
   *           for each error will be listed here (codes are non-standard, but
   *           commonly used).
   */

  parse(response) {
    if (typeof response.body === "object") {
      this.details = response.body;
    } else {
      this.details = JSON.parse(response.body);
    }

    this.codes = GraphQlError.getCodes(this.details.errors);
    this.message = this.details.errors.map((item) => item.message).join(", ");
    if (response.statusCode >= 300) {
      this.message = `(Status: ${response.statusCode}) ${this.message}`;
    }
  }

  static getCodes(errorList) {
    if (Array.isArray(errorList)) {
      return errorList
        .map((error) => error.code || error.extensions?.code)
        .filter(Boolean);
    } else {
      return [];
    }
  }
}

/**
 * If the HTTP response represents a GraphQL error, throws an instance of
 * `GraphQlError` with relevant information. If it is an HTTP error without
 * GraphQL-formatted errors, throws an instance of `HttpApiError`.
 * @param {HttpResponse} response
 */
function assertValidGraphQl(response) {
  if (Array.isArray(response.body?.errors)) {
    throw new GraphQlError(response);
  } else if (response.statusCode >= 400) {
    throw new HttpApiError(response);
  }
}

class ParseError extends BaseError {}

module.exports = {
  GraphQlError,
  HttpApiError,
  ParseError,
  assertValidGraphQl,
};
