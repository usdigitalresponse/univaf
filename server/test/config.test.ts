import { logger, logStackTrace } from "../src/config";
import { transports } from "winston";
import { Writable } from "stream";

let output = "";
const stream = new Writable();
stream._write = (chunk, encoding, next) => {
  output = output += chunk.toString();
  next();
};
const streamTransport = new transports.Stream({ stream });
logger.add(streamTransport);

describe("logger functionality", () => {
  afterEach(() => {
    output = "";
  });
  it("should print info correctly", () => {
    logger.info("test message");
    const logEvents = output.trim().split("\n");
    expect(logEvents).toHaveLength(1);
    expect(logEvents[0]).toMatch("[univaf] info: test message");
  });
  it("should print error correctly", () => {
    logger.error(new Error("test error"));
    const logEvents = output.trim().split("\n");
    expect(logEvents).toHaveLength(1);
    expect(logEvents[0]).toMatch("[univaf] error: test error");
  });
  it("should print stack trace correctly", () => {
    logStackTrace(logger, new Error("test stack"));
    const logEvents = output.trim().split("\n");
    expect(logEvents.length).toBeGreaterThan(1);
    expect(logEvents[0]).toMatch("[univaf] error: Error: test stack");
  });
  it("should print stack trace correctly without error message", () => {
    logStackTrace(logger, "test stack");
    const logEvents = output.trim().split("\n");
    expect(logEvents).toHaveLength(1);
    expect(logEvents[0]).toMatch("[univaf] error: test stack");
  });
});
