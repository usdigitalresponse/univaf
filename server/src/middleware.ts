import { Response, Request, NextFunction } from "express";
import { getApiKeys } from "./config";

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

  formatLocation(location: any): any {
    // mutates and returns a location object, formatted according to URL params
    if (this.req.query.external_id_format !== "v2") {
      location.external_ids = Object.fromEntries(location.external_ids);
    }
    return location;
  }
}

export function versionedMiddleware(
  req: AppRequest,
  res: Response,
  next: NextFunction
) {
  req.versioned = new VersionedMethods(req);
  next();
}
