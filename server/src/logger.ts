import { createLogger, Logger, transports, format } from "winston";
const { combine, timestamp, splat, printf, label } = format;
import { LOG_LEVEL } from "./config";

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

export const logger: Logger = createLogger({
  format: customFormatWithTimestamp,
  level: LOG_LEVEL,
  transports: [new transports.Console()],
});

export function logStackTrace(logger: Logger, err: any): void {
  if (err instanceof Error) {
    logger.error(`${err.stack || err}`);
  } else {
    logger.error(err);
  }
}