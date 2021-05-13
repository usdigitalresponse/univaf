"use strict";

import { Response, Request, RequestHandler, NextFunction } from "express";
import * as db from "./db";
import { ApiError } from "./exceptions";
import { ProviderLocation } from "./interfaces";
import { AppRequest } from "./middleware";

const UUID_PATTERN = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;

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

  // Load results in chunks and stream them out, so we don't get tied up with
  // big result sets.
  // TODO: proper pagination.
  const baseWhere = where;
  const baseValues = values;
  let started = false;
  const limit = 2000;
  const startTime = Date.now();
  while (true) {
    const chunk: Array<ProviderLocation> = await db.listLocations({
      includePrivate,
      where,
      values,
      limit,
    });
    if (!started) {
      res.setHeader("Content-Type", "application/json");
      res.write("[");
    }
    for (const row of chunk) {
      if (started) res.write(",");
      res.write("\n" + JSON.stringify(row));
      started = true;
    }

    // Stop if there is no more data.
    if (chunk.length < limit) break;

    // Stop if we've been reading for too long. (Also write an error entry)
    if (Date.now() - startTime > 25 * 1000) {
      res.write(JSON.stringify({ error: "Timeout while listing locations!" }));
      break;
    }

    where = baseWhere.concat(["(created_at, id) > (?, ?)"]);
    values = baseValues.concat([
      chunk[chunk.length - 1].created_at,
      chunk[chunk.length - 1].id,
    ]);
  }
  res.end("\n]\n");
};

/**
 * Returns a single provider based upon the id
 * @param req
 * @param res
 */

export const getById = async (req: AppRequest, res: Response) => {
  const id = req.params["id"];
  if (!id) {
    return sendError(res, "Missing param 'id'", 422);
  }

  const includePrivate = req.query.include_private === "true";
  if (includePrivate && !req.authorization) {
    return sendError(res, "Not authorized for private data", 403);
  }

  const provider = await db.getLocationById(id, { includePrivate });
  if (!provider) {
    return sendError(res, `No provider location with ID '${id}'`, 404);
  } else {
    res.json(provider);
  }
};

/**
 * Updates a given location's availability
 *
 * TODO: add some sort of auth/key
 * @param req
 * @param res
 */

export const update = async (req: AppRequest, res: Response) => {
  if (!req.authorization) {
    return sendError(res, "Not authorized to update data", 403);
  }

  const data = req.body;

  if (
    !data.id &&
    !(data.external_ids && Object.keys(data.external_ids).length)
  ) {
    return sendError(
      res,
      "You must set `id` or `external_ids` in the data",
      422
    );
  }

  const result: any = { location: { action: null } };

  // FIXME: need to make this a single PG operation or add locks around it. It's
  // possible for two concurrent updates to both try and create a location.
  let location;
  if (data.id && UUID_PATTERN.test(data.id)) {
    location = await db.getLocationById(data.id);
  }
  if (!location && data.external_ids) {
    location = await db.getLocationByExternalIds(data.external_ids);
  }
  if (!location) {
    location = await db.createLocation(data);
    result.location.action = "created";
  } else if (req.query.update_location) {
    // Only update an existing location if explicitly requested to do so via
    // querystring and if there is other data for it.
    // (In most cases, we expect the DB will have manual updates that make it
    // a better source of truth for locations than the source data, hence the
    // need to opt in to updating here.)
    const fields = Object.keys(data).filter((key) => key !== "availability");
    if (fields.length > 1) {
      data.id = location.id;
      await db.updateLocation(data);
      result.location.action = "updated";
    }
  }

  if (data.availability) {
    // Accommodate old formats that sources might still be sending.
    // TODO: remove once loaders have all been migrated.
    if (data.availability.updated_at) {
      data.availability.valid_at = data.availability.updated_at;
      delete data.availability.updated_at;
    }

    try {
      const operation = await db.updateAvailability(
        location.id,
        data.availability
      );
      result.availability = operation;
    } catch (error) {
      if (error instanceof ApiError) {
        return sendError(res, error);
      }
      if (error instanceof TypeError) {
        return sendError(res, error, 422);
      } else {
        throw error;
      }
    }
  }

  if (
    result.location?.action === "created" ||
    result.availability?.action === "created"
  ) {
    res.status(201);
  }
  res.json(result);
};

/**
 * Basic healthcheck to indicate the server is OK.
 * @param req
 * @param res
 */
export const healthcheck = async (req: AppRequest, res: Response) => {
  // TODO: include the db status before declaring ourselves "up"
  res.status(200).send("OK!");
};
