class HttpApiError extends Error {
  /**
   * Create an error object for a bad response from an API.
   * @param {http.IncomingMessage} response
   */
  constructor(response, { cause = null } = {}) {
    super(`${response.statusCode} ${response.statusMessage}`, { cause });
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
   * @param {http.IncomingMessage} response An HTTP response with error info.
   */
  parse(response) {
    this.details = JSON.parse(response.body);
    this.message = this.details.error.message;
  }
}

class GraphQlError extends HttpApiError {
  parse(response) {
    if (typeof response.body === "object") {
      this.details = response.body;
    } else {
      this.details = JSON.parse(response.body);
    }
    this.message = this.details.errors.map((item) => item.message).join(", ");
  }
}

class ParseError extends Error {}

module.exports = {
  GraphQlError,
  HttpApiError,
  ParseError,
};
