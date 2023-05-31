const nodeUtil = require("node:util");
const Sentry = require("@sentry/node");
const config = require("./config");

// Only log to stderr for these levels.
const LOCAL_LEVELS = [
  config.debug ? "debug" : null,
  "info",
  "warning",
  "error",
].filter(Boolean);

// Only log to a remote service for these levels.
const REMOTE_LEVELS = ["warning", "error"];

function logToStderr(_level, _raw, message, context) {
  console.warn(
    message,
    context !== undefined ? nodeUtil.inspect(context, { depth: 8 }) : ""
  );
}

function logToSentry(level, raw, formatted, context) {
  const sentryOptions = { level, contexts: { context } };

  // Sentry does better fingerprinting with an actual exception object.
  if (raw instanceof Error) {
    Sentry.captureException(raw, sentryOptions);
  } else {
    Sentry.captureMessage(formatted, sentryOptions);
  }
}

class Logger {
  #prefix = "";

  constructor(prefix) {
    this.#prefix = prefix;
  }

  get prefix() {
    return this.#prefix;
  }

  log(level, message, context) {
    const formatted = this.#prefix ? `${this.#prefix}: ${message}` : message;
    if (LOCAL_LEVELS.includes(level)) {
      logToStderr(level, message, formatted, context);
    }

    if (REMOTE_LEVELS.includes(level)) {
      logToSentry(level, message, formatted, context);
    }
  }

  debug(message, context) {
    this.log("debug", message, context);
  }

  info(message, context) {
    this.log("info", message, context);
  }

  warn(message, context) {
    this.log("warning", message, context);
  }

  error(message, context) {
    this.log("error", message, context);
  }
}

module.exports = { Logger, logToStderr, logToSentry };
