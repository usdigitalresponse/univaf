const { BaseError, ParseError } = require("univaf-common/exceptions");

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
   * @property {string[]} codes If the GraphQL API returned error codes, the
   *           code for each error will be listed here (codes are non-standard,
   *           but commonly used).
   */

  parse(response) {
    if (typeof response.body === "object") {
      this.details = response.body;
    } else {
      this.details = JSON.parse(response.body);
    }

    const errors = GraphQlError.getUniqueErrors(this.details.errors);
    this.codes = errors.map((e) => e.code).filter(Boolean);
    this.message = errors.map((e) => `${e.message} (×${e.count})`).join(", ");
    if (response.statusCode >= 300) {
      this.message = `(Status: ${response.statusCode}) ${this.message}`;
    }
  }

  /**
   * Normalizes and dedupes a list of of errors from a GraphQL response.
   * Different GraphQL servers format errors slightly differently, and this
   * makes sure we get a `message` and `code`, wherever those properties may
   * be stored. It also dedupes the list of errors, since we frequently see
   * responses that are just a long list of the same error (often
   * "internal server error"). The `count` property of each error indicates how
   * many times that error was seen.
   *
   * This dedupes based on the error message (if found), since we expect that
   * multiple errors of the same type/code may have slightly different details
   * and messages, which we don't want to lose.
   * @param {any[]} errorList
   * @returns {{
   *   count: number,
   *   message: string,
   *   code?: string,
   *   [index: string]: any
   * }[]}
   */
  static getUniqueErrors(errorList) {
    if (Array.isArray(errorList)) {
      const uniqueErrors = new Map();
      for (const error of errorList) {
        const code = error.code || error.extensions?.code;
        const key = error.message || code || "[unknown error]";
        const summary = uniqueErrors.get(key);
        if (summary) {
          summary.errorCount += 1;
        } else {
          uniqueErrors.set(key, {
            count: 1,
            message: key,
            code,
            ...error,
          });
        }
      }
      return [...uniqueErrors.values()];
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

module.exports = {
  GraphQlError,
  HttpApiError,
  ParseError,
  assertValidGraphQl,
};
