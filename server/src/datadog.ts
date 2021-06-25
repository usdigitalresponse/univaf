import { Response, Request, NextFunction } from "express";
import StatsD from "hot-shots";

export const dogstatsd = new StatsD();
const stat = "node.express.router";
const DELIM = "-";
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
function replacePipeChar(str: String): String {
	if (str instanceof RegExp) {
		str = str.toString();
	}

	return str && str.replace(REGEX_PIPE, DELIM);
}

function getRoute(req: MonitoredRequest): String {
	const routePath = req.route && req.route.path ? req.route.path : "";
	return replacePipeChar(routePath);
}

export function datadogMiddleware(
	req: MonitoredRequest,
	res: Response,
	next: NextFunction
) {
	if (!req.startTime) {
		req.startTime = new Date();
	}
	res.on("finish", function () {
		const route = getRoute(req);
		let statTags = [];

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
