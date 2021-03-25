"use strict";

import { Response, Request, NextFunction } from "express";
import * as db from "./db";

/**
 * Index returns the full list of everything in our database
 */
export const list = async (req: Request, res: Response) => {
  const providers = await db.list();
  res.json(providers);
};

/**
 * Returns a single provider based upon the id
 * @param req
 * @param res
 */

export const getById = async (req: Request, res: Response) => {
  const id = req.params["id"];
  if (!id) {
    throw new Error("missing param 'id'");
  }

  const provider = await db.getById(id);
  if (!provider) {
    res.status(404);
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

export const update = async (req: Request, res: Response) => {
  const { id, availability } = req.body;

  const provider = await db.getById(id);
  if (!provider) {
    res.status(400);
    return res.json({
      success: false,
      error: `Could not find a provider with id ${id}`,
    });
  }

  await db.update(id, availability);
  res.json({ success: true });
};
