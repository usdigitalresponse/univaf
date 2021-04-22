/**
 * Error that is safe to surface externally (i.e. in an HTTP response).
 */
export class ApiError extends Error {
  httpStatus = 500;
  code?: string;
  extra?: any;

  constructor(message: string, { code, ...extra }: any = {}) {
    super(message);
    this.extra = extra;
    if (code) this.code = code;
  }

  /**
   * Format the error as a JSON-stringifiable object.
   * @returns {any}
   */
  toJson() {
    return {
      message: this.message,
      code: this.code,
      ...this.extra,
    };
  }
}

/**
 * Indicates a resource could not be found.
 */
export class NotFoundError extends ApiError {
  httpStatus = 404;
  code = "not_found";
}

/**
 * Indicates data is too old to make use of.
 */
export class OutOfDateError extends ApiError {
  httpStatus = 409;
  code = "out_of_date";
}
