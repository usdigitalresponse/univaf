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
 * An action is not permitted for the current user.
 */
export class AuthorizationError extends ApiError {
  httpStatus = 403;
  code = "not_authorized";
}

/**
 * A resource could not be found.
 */
export class NotFoundError extends ApiError {
  httpStatus = 404;
  code = "not_found";
}

/**
 * Input data was incorrectly formatted or otherwise invalid.
 */
export class ValueError extends ApiError {
  httpStatus = 422;
  code = "value_error";
}

/**
 * Data is too old to make use of.
 */
export class OutOfDateError extends ApiError {
  httpStatus = 409;
  code = "out_of_date";
}
