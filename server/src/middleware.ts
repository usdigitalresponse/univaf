import { Response, Request, NextFunction } from "express";
import bodyParser from "body-parser";
import { getApiKeys } from "./config";

export interface AppRequest extends Request {
  authorization?: string;
  bodyByteLength?: number;
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
 * A JSON body parsing middleware that also records the raw size of the request
 * body as `request.bodyByteLength`.
 */
export function parseJsonBody(
  options: bodyParser.OptionsJson
): ReturnType<typeof bodyParser.json> {
  return bodyParser.json({
    ...options,

    // `verify` is a convenient callback to get the decoded/decompressed body
    // before parsing, so this wraps whatever `verify` function may have been
    // passed in and uses it to count bytes.
    verify(
      request: AppRequest,
      response: Response,
      buffer: Buffer,
      encoding: string
    ) {
      request.bodyByteLength = buffer.byteLength || buffer.length;
      if (options.verify) {
        options.verify(request, response, buffer, encoding);
      }
    },
  });
}
