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

export const logger: Logger = createLogger({
  format: customFormatWithTimestamp,
  level: level,
  transports: [new transports.Console()],
});
