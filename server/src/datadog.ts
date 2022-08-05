import { Response, Request, NextFunction } from "express";
import StatsD from "hot-shots";
import { getHostInstance, getPlatform } from "./config";

const globalTags = [`instance:${getHostInstance()}`];
if (getPlatform()) {
  globalTags.push(`platform:${getPlatform()}`);
}

export const dogstatsd = new StatsD({
  mock: process.env.NODE_ENV == "test",
  globalTags,
});
const stat = "node.express.router";
const DELIMITER = "-";
const REGEX_PIPE = /\|/g;

export interface MonitoredRequest extends Request {
  startTime?: Date;
}

/**
 * Checks if str is a regular expression and stringifies it if it is.
 * Returns a string with all instances of the pipe character replaced with
 * the delimiter.
 *
 * Taken from the original connect-datadog module
 * {@link https://github.com/DataDog/node-connect-datadog/blob/master/lib/index.js#L15-L28}
 */
function replacePipeChar(text: string | RegExp): string {
  if (text instanceof RegExp) {
    text = text.toString();
  }

  return text && text.replace(REGEX_PIPE, DELIMITER);
}

function getRoute(req: MonitoredRequest): string {
  const routePath = req.route && req.route.path ? req.route.path : "";
  return replacePipeChar(routePath);
}

export function datadogMiddleware(
  req: MonitoredRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.startTime) {
    req.startTime = new Date();
  }
  res.on("finish", function () {
    const route = getRoute(req);
    const statTags = [];

    if (route.length > 0) {
      statTags.push(`route:${route}`);
    }

    statTags.push(`method:${req.method.toLowerCase()}`);
    statTags.push(`response_code:${res.statusCode}`);

    const now = new Date();
    const responseTime = now.valueOf() - req.startTime.valueOf();

    dogstatsd.increment(`${stat}.response_total`, 1, statTags);
    dogstatsd.histogram(`${stat}.response_time`, responseTime, 1, statTags);
  });
  next();
}
