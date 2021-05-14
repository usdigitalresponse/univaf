import { NextFunction, RequestHandler, Request, Response } from "express";

export type PromiseHandler = (
  request: Request,
  response: Response,
  next?: NextFunction
) => void | Promise<any>;

export function asyncHandler(handler: PromiseHandler): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    const result = handler(request, response, next);
    if (result instanceof Promise) {
      result.catch(next);
    }
  };
}
