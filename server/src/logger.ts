import { createLogger, Logger, transports, format } from "winston";
const { combine, timestamp, splat, printf, label } = format;

const level = process.env.LOG_LEVEL || "debug";


const myFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

const simpleWithTimestamp = combine(
  label({ label: 'univaf' }),
  timestamp(),
  splat(),
  myFormat
);

export const logger: Logger = createLogger({
  format: simpleWithTimestamp,
  level: level,
  transports: [new transports.Console()],
});
