import { Response, Request, NextFunction } from "express";
import { getApiKeys, getHostUrl, HOST_URL } from "./config";
import { getRequestHost } from "./utils";

export interface AppRequest extends Request {
  authorization?: string;
  versioned: VersionedMethods;
}

const API_KEYS = getApiKeys();

export function authorizeRequest(
  req: AppRequest,
  res: Response,
  next: NextFunction
): any {
  req.authorization = null;
  const key = req.get("x-api-key");
  if (key && API_KEYS.includes(key)) {
    req.authorization = key;
  }
  return next();
}

class VersionedMethods {
  req: AppRequest;

  constructor(req: AppRequest) {
    this.req = req;
  }

  // add methods here that use this.req to decide how behave
}

export function versionedMiddleware(
  req: AppRequest,
  res: Response,
  next: NextFunction
): void {
  req.versioned = new VersionedMethods(req);
  next();
}

/**
 * If the app has a configured HOST_URL, redirect any request at another host
 * to the configured host. For example, if `HOST_URL == "https://getmyvax.org"`,
 * this will redirect "www.getmyvax.org/x/y/z" to "getmyvax.org/x/y/z".
 */
export function redirectToPrimaryHost(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  if (HOST_URL) {
    const primaryOrigin = getHostUrl(request);
    const origin = `${request.protocol}://${getRequestHost(request)}`;
    if (origin !== primaryOrigin) {
      return response.redirect(`${primaryOrigin}${request.originalUrl}`);
    }
  }
  return next();
}
