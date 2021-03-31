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
  try {
    await db.updateAvailability(data.id, data);
  } catch (error) {
    if (error.message.startsWith("not found")) {
      return res.status(404).json({
        error: `No provider location with ID '${data.id}'`,
      });
    } else if (error instanceof TypeError) {
      return res.status(422).json({
        error: error.message,
      });
    } else {
      throw error;
    }
  }
  res.json({ success: true });
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
