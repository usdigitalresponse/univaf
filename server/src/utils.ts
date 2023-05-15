import { NextFunction, RequestHandler, Request, Response } from "express";
import { URLSearchParams, format as urlFormat, parse as urlParse } from "url";
import { ValueError } from "./exceptions";
import { getPrimaryHost } from "./config";

export const UUID_PATTERN =
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;

export type PromiseHandler = (
  request: Request,
  response: Response,
  next?: NextFunction
) => void | Promise<any>;

/**
 * Make an Express-compatible request handler from an async function.
 * This basically just adds error handling to the async function. If the
 * function is middleware, it’s still responsible for calling `next`.
 * @param handler The async function to use as a handler.
 */
export function asyncHandler(handler: PromiseHandler): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    const result = handler(request, response, next);
    if (result instanceof Promise) {
      result.catch(next);
    }
  };
}

/**
 * Create a URL to the current page, but with added/updated query parameters.
 * This merges existing and new query parameters.
 * @param request The current HTTP request.
 * @param newQuery Object with new query parameters to add to the URL.
 */
export function addQueryToCurrentUrl(request: Request, newQuery: any): string {
  const query = new URLSearchParams({ ...request.query, ...newQuery });
  return absoluteUrl(`${request.path}?${query}`, request);
}

interface PaginationLinks {
  prev?: string;
  next?: string;
}

interface PaginationParameters {
  pageNext?: string;
  limit: number;
}

export const Pagination = {
  /**
   * Get the pagination-related query parameters for a request.
   * @param request The HTTP request to get parameters for.
   */
  getParameters(request: Request): PaginationParameters {
    let limit = 0;
    if (request.query.limit) {
      limit = parseInt(request.query.limit as string, 10) || 0;
      if (limit <= 0) {
        throw new ValueError("The 'limit' query param must be > 0");
      }
    }

    const pageNext = request.query.page_next as string;

    return { limit, pageNext };
  },

  /**
   * Create links to related URLs (e.g. next page) for a paginated request.
   * @param request The current HTTP request.
   * @param keys The pagination keys to generate URLs for.
   */
  createLinks(request: Request, keys: { next?: string }): PaginationLinks {
    const links: PaginationLinks = {};
    if (keys.next) {
      links.next = addQueryToCurrentUrl(request, { page_next: keys.next });
    }
    return links;
  },
};

export function urlDecodeSpecialPathChars(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const REPLACE_MAP: { [key: string]: string } = { "%24": "$" };
  const url = urlParse(req.url);

  url.pathname = url.pathname.replace(/%\d\d/g, (matched) => {
    return REPLACE_MAP[matched] || matched;
  });

  req.url = urlFormat(url);
  next();
}

/**
 * Get the complete host for a request. This differs from `request.hostname`
 * by including the port.
 *
 * The code here is mostly stolen from Express 5.x's `request.host`; in
 * Express 4.x, this property is an alias for `hostname` and has no port.
 */
export function getRequestHost(request: Request): string {
  const trust = request.app.get("trust proxy fn");
  let val = request.get("X-Forwarded-Host");

  if (!val || !trust(request.socket.remoteAddress, 0)) {
    val = request.get("Host");
  } else if (val.indexOf(",") !== -1) {
    // Note: X-Forwarded-Host is normally only ever a
    //       single value, but this is to be safe.
    val = val.substring(0, val.indexOf(",")).trimEnd();
  }

  return val || undefined;
}

export function absoluteUrl(localUrl: string, request?: Request): string {
  if (/^https?:\/\//.test(localUrl)) return localUrl;

  const host = getPrimaryHost() || (request && getRequestHost(request));
  if (!host) {
    throw new Error(
      "You must configure a primary host or provide a request to build an absolute URL from."
    );
  }

  const protocol = request?.protocol ?? "https";
  const baseUrl = `${protocol}://${host}${request?.baseUrl ?? ""}/`;
  return new URL(localUrl, baseUrl).href;
}
