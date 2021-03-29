import { Response, Request, NextFunction } from "express";
import { getApiKeys } from "./config"

export interface AppRequest extends Request {
  authorization?: string
}

const API_KEYS = getApiKeys();

export function authorizeRequest (req: AppRequest, res: Response, next: NextFunction): any {
  req.authorization = null;
  const key = req.get("x-api-key");
  if (key && API_KEYS.includes(key)) {
    req.authorization = key
  }
  return next();
}
