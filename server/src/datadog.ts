import { Response, Request, NextFunction } from "express";
import StatsDClient, { StatsD } from "hot-shots";
import { BufferedMetricsLogger } from "datadog-metrics";
import { getHostInstance, getPlatform } from "./config";

const globalTags = [`instance:${getHostInstance()}`];
if (getPlatform()) {
  globalTags.push(`platform:${getPlatform()}`);
}

const shouldMock = process.env.NODE_ENV === "test";

/**
 * A DataDog API reporter that doesn't actually send metrics, used for mocking.
 * The datadog-metrics package actually has this built-in, but doesn't export
 * it for external use.
 * See: https://github.com/dbader/node-datadog-metrics/issues/67
 */
const nullReporter = {
  report(_metrics: any[], onSuccess?: () => void) {
    if (typeof onSuccess === "function") {
      onSuccess();
    }
  },
};

export let dogMetrics: StatsD | BufferedMetricsLogger;
if (process.env.DATADOG_API_KEY || process.env.DATADOG_USE_API) {
  // No `host` is specified here: each one costs $18, and is organized around
  // tracking `system.*` metrics, which we aren't worried about here.
  // There are also `container.*` metrics, and we should probably set the
  // `container_id:<id>` tag if sending those (but we aren't sending those).
  // each one of them costs less than a "host".
  dogMetrics = new BufferedMetricsLogger({
    defaultTags: globalTags,
    // DogStatsD's flush interval is 10 seconds. Match that so our metrics
    // behave similarly across approaches.
    flushIntervalSeconds: shouldMock ? 0 : 10,
    reporter: shouldMock ? nullReporter : undefined,
  } as any);

  // HACK: Override `histogram` to provide default options that are a closer
  // match to what StatsD does (StatsD has a built-in histogram type, but
  // DataDog's API does not). We change the options here to generate something
  // closer to what DogStatsD normally does with the histogram type.
  // See: https://docs.datadoghq.com/metrics/types/?tab=histogram#definition
  // TODO: Consider removing once we become confident the API works better for
  // us than the agent.
  const originalHistogram = dogMetrics.histogram;
  dogMetrics.histogram = function (
    key,
    value,
    tags,
    timestamp,
    options: any = {}
  ) {
    // DogStatsD calculates a median, which datadog-metrics does not support. :(
    options.aggregates ||= ["max", "avg", "count"];
    options.percentiles ||= [0.95];
    return originalHistogram.call(this, key, value, tags, timestamp, options);
  };
} else {
  dogMetrics = new StatsDClient({
    mock: shouldMock,
    globalTags,
  });
}

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

function getRoute(res: Response): string {
  let routePath = res.req.route?.path || "";

  // If a middleware responds (e.g. to serve static files), there won’t be a
  // route. If the request was successful or was a *server* error, use the
  // requested URL. (These conditions are mainly to strip the wide variety of
  // bad or malicious requests for non-existent URLs.)
  if (!routePath && (res.statusCode < 300 || res.statusCode >= 500)) {
    routePath = res.req.originalUrl.split("?", 1)[0];
  }

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
    const route = getRoute(res);
    const statTags = [];

    if (route.length > 0) {
      statTags.push(`route:${route}`);
    }

    statTags.push(`method:${req.method.toLowerCase()}`);
    statTags.push(`response_code:${res.statusCode}`);

    const isInternal = (req.headers["user-agent"] || "").startsWith("univaf");
    statTags.push(`internal:${isInternal}`);

    const now = new Date();
    const responseTime = now.valueOf() - req.startTime.valueOf();

    dogMetrics.increment(`${stat}.response_total`, 1, statTags);
    dogMetrics.histogram(`${stat}.response_time`, responseTime, statTags);
  });
  next();
}
