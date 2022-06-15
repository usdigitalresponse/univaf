import { Response, Request, NextFunction } from "express";
import { getApiKeys, getPrimaryHost } from "./config";
import { logger } from "./logger";
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
 * If the app has a configured host, redirect any request at another host
 * to the configured host.
 *
 * For example, if `PRIMARY_HOST == "getmyvax.org"`, this will redirect
 * "www.getmyvax.org/x/y/z" to "getmyvax.org/x/y/z".
 */
export function redirectToPrimaryHost(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  const primaryHost = getPrimaryHost();
  // FIXME: testing this redirect madness in production, sigh.
  if (primaryHost && primaryHost !== getRequestHost(request)) {
    const trustProxyFunction = request.app.get("trust proxy fn");
    logger.info(
      `
      DEBUG HOST for ${request.method} ${request.url}
      primaryHost: "${getPrimaryHost()}"
      getRequestHost: "${getRequestHost(request)}"
      Host header: "${request.get("Host")}"
      X-Forwarded-Host header: "${request.get("X-Forwarded-Host")}"
      request.socket.remoteAddress: "${request.socket.remoteAddress}"
      trust: ${
        trustProxyFunction
          ? trustProxyFunction(request.socket.remoteAddress, 0)
          : "[no trust function]"
      }
    `.trim()
    );
    // return response.redirect(
    //   `${request.protocol}://${primaryHost}${request.originalUrl}`
    // );
  }
  return next();
}
