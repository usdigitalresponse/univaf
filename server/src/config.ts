import { Request } from "express";
import type { Knex } from "knex";
import { createLogger, Logger, transports, format } from "winston";
const { combine, timestamp, splat, printf, label } = format;

const level = process.env.LOG_LEVEL || "info";

const timestampPrefixLogFormat = printf(
  ({ level, message, label, timestamp }) => {
    return `${timestamp} [${label}] ${level}: ${message}`;
  }
);

const customFormatWithTimestamp = combine(
  label({ label: "univaf" }),
  timestamp(),
  splat(),
  timestampPrefixLogFormat
);

export function getApiKeys(): Array<string> {
  let keyList = process.env.API_KEYS;
  if (!keyList) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "You must set API_KEYS to a comma-separated list of keys in production"
      );
    } else {
      keyList = "dev-key";
    }
  }

  return keyList.split(",").map((key) => key.trim());
}

export function getHostUrl(request?: Request): string {
  let hostUrl = process.env.HOST_URL;
  if (!hostUrl) {
    if (!request) {
      throw new Error("Cannot calculate host URL without a request");
    } else {
      hostUrl = `${request.protocol}://${request.headers.host}`;
    }
  }
  if (hostUrl.endsWith("/")) hostUrl = hostUrl.slice(0, -1);

  return hostUrl;
}

export function loadDbConfig(): Knex.Config {
  const knexfile = require("../knexfile");
  const nodeEnv = process.env.NODE_ENV || "development";
  return knexfile[nodeEnv];
}

export const logger: Logger = createLogger({
  format: customFormatWithTimestamp,
  level: level,
  transports: [new transports.Console()],
});

export function logStackTrace(logger: Logger, err: any): void {
  if (err instanceof Error) {
    logger.error(`${err.stack || err}`);
  } else {
    logger.error(err);
  }
}
