import { NextFunction, RequestHandler, Request, Response } from "express";
import { URLSearchParams, format as urlFormat, parse as urlParse } from "url";
import { ValueError } from "./exceptions";

export const UUID_PATTERN = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;

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
  return `${request.baseUrl}${request.path}?${query}`;
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
    let limit: number = 0;
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
    let links: PaginationLinks = {};
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
) {
  const REPLACE_MAP = { "%24": "$" };
  const url = urlParse(req.url);

  Object.entries(REPLACE_MAP).forEach(([code, c]) => {
    const re = new RegExp(code, "g");
    url.pathname = url.pathname.replace(re, c);
  });

  req.url = urlFormat(url);
  next();
}
