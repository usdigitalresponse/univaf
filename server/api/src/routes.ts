"use strict";

import { Response, Request, NextFunction } from "express";

/**
 * List of API examples.
 * @route GET /api
 */
export const index = (req: Request, res: Response) => {
  res.json({ "hello": "world" });
};
