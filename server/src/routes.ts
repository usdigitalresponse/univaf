"use strict";

import { Response, Request, RequestHandler, NextFunction } from "express";
import * as db from "./db";
import { AppRequest } from "./middleware";

/**
 * Index returns the full list of everything in our database
 */
export const list = async (req: AppRequest, res: Response) => {
  const includePrivate = req.query.include_private === "true";
  if (includePrivate && !req.authorization) {
    return res.status(403).json({ error: "Not authorized for private data" });
  }

  let index = 1;
  let where: Array<string> = [];
  let values = [];
  if (req.query.state) {
    where.push(`state = $${index++}`);
    values.push(req.query.state);
  }
  if (req.query.provider) {
    where.push(`provider = $${index++}`);
    values.push(req.query.provider);
  }

  const providers = await db.listLocations({ includePrivate, where, values });
  res.json(providers);
};

/**
 * Returns a single provider based upon the id
 * @param req
 * @param res
 */

export const getById = async (req: AppRequest, res: Response) => {
  const id = req.params["id"];
  if (!id) {
    return res.status(422).json({ error: "missing param 'id'" });
  }

  const includePrivate = req.query.include_private === "true";
  if (includePrivate && !req.authorization) {
    return res.status(403).json({ error: "Not authorized for private data" });
  }

  const provider = await db.getLocationById(id, { includePrivate });
  if (!provider) {
    res.status(404).json({ error: `No provider location with ID '${id}'` });
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
    return res.status(403).json({ error: "Not authorized to update data" });
  }

  const data = req.body;

  // TODO: if no `id`, look up by external IDs?
  if (!data.id) {
    return res.status(422).json({ error: "You must set an ID in the data" });
  }

  const location = await db.getLocationById(data.id);
  if (!location) {
    await db.createLocation(data);
  } else if (req.query.update_location) {
    // Only update an existing location if explicitly requested to do so via
    // querystring and if there is other data for it.
    // (In most cases, we expect the DB will have manual updates that make it
    // a better source of truth for locations than the source data, hence the
    // need to opt in to updating here.)
    const fields = Object.keys(data).filter((key) => key !== "availability");
    if (fields.length > 1) {
      await db.updateLocation(data);
    }
  }

  let success = true;
  if (data.availability) {
    success = false;
    try {
      success = await db.updateAvailability(data.id, data.availability);
    } catch (error) {
      if (error instanceof TypeError) {
        return res.status(422).json({ error: error.message });
      } else {
        throw error;
      }
    }
  }

  if (!success) {
    res.status(500);
  }
  res.json({ success });
};

/**
 * Healthcheck code whic
 * @param req
 * @param res
 */

export const healthcheck = async (req: AppRequest, res: Response) => {
  // TODO: include the db status before declaring ourselves "up"
  res.status(200).send("OK!");
};
