import { createLogger, Logger, transports, format } from "winston";
const { combine, timestamp, splat, printf, label } = format;
import { LOG_LEVEL } from "./config";

// Some platforms include the timestamp for each log line, so adding our own
// timestamp makes them harder to read.
const shouldLogTimestamp = !(
  process.env.RENDER ||
  process.env.ECS_CONTAINER_METADATA_URI ||
  process.env.ECS_CONTAINER_METADATA_URI_V4
);

const univafLogFormat = printf(({ level, message, label, timestamp }) => {
  let formatted = `[${label}] ${level}: ${message}`;
  if (shouldLogTimestamp) {
    formatted = `${timestamp} ${formatted}`;
  }
  return formatted;
});

const customFormatWithTimestamp = combine(
  label({ label: "univaf" }),
  timestamp(),
  splat(),
  univafLogFormat
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
