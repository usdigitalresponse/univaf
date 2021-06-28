"use strict";

import { Response } from "express";
import * as db from "../db";
import { ApiError } from "../exceptions";
import { AppRequest } from "../middleware";
import { Pagination } from "../utils";

/** Maximum time for streaming lists to run for in seconds. */
const MAX_STREAMING_TIME = 25 * 1000;

/**
 * Send an error response.
 * @param response HTTP Response to write to
 * @param error Error instance, error-like object, or a string
 * @param httpStatus HTTP status code to use
 */
function sendError(response: Response, error: any, httpStatus?: number): void {
  if (error instanceof ApiError) {
    response
      .status(httpStatus || error.httpStatus)
      .json({ error: error.toJson() });
  } else {
    const message = error.message || error;
    response
      .status(httpStatus || 500)
      .json({ error: { message, code: error.code } });
  }
}

/**
 * Index returns the full list of everything in our database
 */
export const list = async (req: AppRequest, res: Response) => {
  const includePrivate = req.query.include_private === "true";
  if (includePrivate && !req.authorization) {
    return sendError(res, "Not authorized for private data", 403);
  }

  let where: Array<string> = [];
  let values: Array<any> = [];
  if (req.query.state) {
    where.push(`state = ?`);
    values.push(req.query.state);
  }
  if (req.query.provider) {
    where.push(`provider = ?`);
    values.push(req.query.provider);
  }
  const { pageNext: start } = Pagination.getParameters(req);

  // Load results in batches and stream them out, so we don't get tied up with
  // big result sets.
  let started = false;
  const startTime = Date.now();
  const resultsIterator = await db.iterateLocationBatches({
    includePrivate,
    where,
    values,
    start,
  });

  const writeStart = () => {
    res.setHeader("Content-Type", "application/json");
    res.write("[");
    started = true;
  };

  for await (const batch of resultsIterator) {
    for (const location of batch.locations) {
      if (started) {
        // Write the comma first so we don't wind up with one at the end of the
        // list of results (since that's not valid JSON).
        res.write(",");
      } else {
        // Wait until the first query to write headers and the start of the JSON.
        // If the query throws, we won't have written these and so can still
        // respond with our normal error handling.
        writeStart();
      }
      res.write("\n" + JSON.stringify(req.versioned.formatLocation(location)));
    }

    // Stop if we've been reading for too long and write an object with a URL
    // the client can resume from.
    if (Date.now() - startTime > MAX_STREAMING_TIME && batch.next) {
      const links = Pagination.createLinks(req, batch);
      res.write("\n," + JSON.stringify({ __next__: links.next }));
      break;
    }
  }

  if (!started) writeStart();
  res.end("\n]\n");
};
