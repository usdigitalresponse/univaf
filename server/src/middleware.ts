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
