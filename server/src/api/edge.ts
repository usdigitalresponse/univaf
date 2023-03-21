"use strict";

import { Request, Response } from "express";
import { ProviderLocation } from "../interfaces";
import { finishSpan, startSpan, withSpan } from "../tracing";
import { dogstatsd } from "../datadog";
import * as db from "../db";
import { ApiError, AuthorizationError } from "../exceptions";
import { AppRequest } from "../middleware";
import { Pagination, UUID_PATTERN } from "../utils";

/** Maximum time for streaming lists to run for in seconds. */
const MAX_STREAMING_TIME = 25 * 1000;

const EXTERNAL_ID_PATTERN = /^(?<system>[^:]+):(?<value>.+)$/;

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
    httpStatus = httpStatus || 500;

    const message = error.message || error;
    const code = error.code || `error_${httpStatus}`;
    response.status(httpStatus).json({ error: { message, code } });
  }
}

function shouldIncludePrivate(req: AppRequest) {
  const includePrivate = req.query.include_private === "true";
  if (includePrivate && !req.authorization) {
    throw new AuthorizationError("Not authorized for private data");
  }
  return includePrivate;
}

function getSourcesInput(req: Request) {
  if (req.query.sources) {
    let rawSources: string[];
    if (Array.isArray(req.query.sources)) {
      rawSources = req.query.sources as string[];
    } else {
      rawSources = [req.query.sources as string];
    }

    return rawSources.flatMap((sources) =>
      sources.split(",").map((source) => source.trim())
    );
  }

  return;
}

function getListLocationInput(req: Request) {
  const where: Array<string> = [];
  const values: Array<any> = [];
  if (req.query.state) {
    where.push(`state = ?`);
    values.push(req.query.state);
  }
  if (req.query.provider) {
    where.push(`provider = ?`);
    values.push(req.query.provider);
  }

  return { where, values };
}

export async function listStream(
  req: AppRequest,
  res: Response
): Promise<void> {
  const includePrivate = shouldIncludePrivate(req);
  const sources = getSourcesInput(req);
  const { where, values } = getListLocationInput(req);
  const { limit, pageNext } = Pagination.getParameters(req);

  // Load results in batches and stream them out, so we don't get tied up with
  // big result sets.
  let started = false;
  const startTime = Date.now();
  const resultsIterator = db.iterateLocationBatches({
    includePrivate,
    where,
    values,
    limit,
    start: pageNext,
    sources,
  });

  const write = (data: any) => {
    return new Promise((resolve, reject) => {
      res.write(data, (error) => {
        if (error) return reject(error);
        resolve(null);
      });
    });
  };

  const writeStart = () => {
    res.setHeader("Content-Type", "application/x-ndjson");
    started = true;
  };

  for await (const batch of resultsIterator) {
    for (const location of batch.locations) {
      // Wait until the first query to write headers and the start of the JSON.
      // If the query throws, we won't have written these and so can still
      // respond with our normal error handling.
      if (!started) {
        writeStart();
      }
      await write(JSON.stringify(location) + "\n");
    }

    // Stop if we've been reading for too long and write an error entry.
    if (Date.now() - startTime > MAX_STREAMING_TIME && batch.next) {
      const links = Pagination.createLinks(req, { next: batch.next });
      await write(JSON.stringify({ __next__: links.next }) + "\n");
      break;
    }
  }

  res.end();
}

/**
 * Index returns the full list of everything in our database
 */
export const list = async (req: AppRequest, res: Response): Promise<void> => {
  const includePrivate = shouldIncludePrivate(req);
  const sources = getSourcesInput(req);
  const { where, values } = getListLocationInput(req);
  const { limit, pageNext } = Pagination.getParameters(req);

  const result = await db
    .iterateLocationBatches({
      includePrivate,
      where,
      values,
      limit,
      start: pageNext,
      sources,
    })
    .next();
  const batch = result.value || { locations: [], next: null };

  withSpan("writeJson", () => {
    res.json({
      links: Pagination.createLinks(req, { next: batch.next }),
      data: batch.locations,
    });
  });
};

/**
 * Returns a single provider based upon the id
 * @param req
 * @param res
 */
export const getById = async (req: AppRequest, res: Response): Promise<any> => {
  const id = req.params["id"];
  if (!id) {
    return sendError(res, "Missing param 'id'", 422);
  }

  const includePrivate = shouldIncludePrivate(req);
  const sources = getSourcesInput(req);

  let provider: any = null;
  const m = id.match(EXTERNAL_ID_PATTERN);
  if (m) {
    provider = await db.getLocationByExternalIds(
      [[m.groups.system, m.groups.value]],
      { includePrivate, includeExternalIds: true }
    );
  }

  if (!provider && UUID_PATTERN.test(id)) {
    provider = await db.getLocationById(id, { includePrivate, sources });
  }

  if (!provider) {
    return sendError(res, `No provider location with ID '${id}'`, 404);
  } else {
    return withSpan("writeJson", () => res.json({ data: provider }));
  }
};

function promoteFromMeta(data: any, field: string) {
  if (data.meta && data.meta[field] != null) {
    data[field] = data.meta[field];
    delete data.meta[field];
  }
}

/**
 * Updates a given location's availability
 * update supports two different formats for req.body.external_ids:
 *  - a dictionary, e.g. {"sys1": "val1", "sys2": "val2"}
 *  - a list of lists of strings e.g. [["sys1", "val1"], ["sys2", "val2"]]
 *
 * TODO: add some sort of auth/key
 * @param req
 * @param res
 */
export const update = async (req: AppRequest, res: Response): Promise<any> => {
  if (!req.authorization) {
    return sendError(res, "Not authorized to update data", 403);
  }

  let data = req.body;

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

  if (data.external_ids && !Array.isArray(data.external_ids)) {
    data = { ...data, external_ids: Object.entries(data.external_ids) };
  }

  if ("address_lines" in data && !Array.isArray(data.address_lines)) {
    if (!data.address_lines) {
      data.address_lines = []; // substitute an empty array for any falsy input value
    } else {
      return sendError(res, "Invalid value for `address_lines`", 422);
    }
  }

  const result: any = { location: { action: null } };
  const source = data?.source || data?.availability?.source;

  // FIXME: need to make this a single PG operation or add locks around it. It's
  // possible for two concurrent updates to both try and create a location.
  const updateLocationSpan = startSpan({ op: "updateLocation" });
  let location: ProviderLocation;
  if (data.id && UUID_PATTERN.test(data.id)) {
    location = await db.getLocationById(data.id, { includePrivate: true });
  }
  if (!location && data.external_ids) {
    location = await db.getLocationByExternalIds(data.external_ids, {
      includePrivate: true,
    });
  }
  if (!location) {
    location = await db.createLocation(data, { source });
    result.location.action = "created";
  } else if (req.query.update_location) {
    // Only update an existing location if explicitly requested to do so via
    // querystring and if there is other data for it.
    // (In most cases, we expect the DB will have manual updates that make it
    // a better source of truth for locations than the source data, hence the
    // need to opt in to updating here.)
    const fields = Object.keys(data).filter((key) => key !== "availability");
    if (fields.length > 1) {
      await db.updateLocation(location, data, { source });
      result.location.action = "updated";
    }
  } else if (data.external_ids?.length) {
    // Otherwise just update the external IDs. This ensures we track every
    // relevant external ID we've seen for a location.
    await db.addExternalIds(location.id, data.external_ids);
  }
  finishSpan(updateLocationSpan);

  if (data.availability) {
    const updateAvailabilitySpan = startSpan({ op: "updateAvailability " });
    // Accommodate old formats that sources might still be sending.
    // TODO: remove once loaders have all been migrated.
    if (data.availability.updated_at) {
      data.availability.valid_at = data.availability.updated_at;
      delete data.availability.updated_at;
    }

    promoteFromMeta(data.availability, "slots");
    promoteFromMeta(data.availability, "capacity");
    promoteFromMeta(data.availability, "available_count");
    promoteFromMeta(data.availability, "products");
    promoteFromMeta(data.availability, "doses");

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
    finishSpan(updateAvailabilitySpan);
  }

  if (
    result.location?.action === "created" ||
    result.availability?.action === "created"
  ) {
    res.status(201);
  }
  res.json({ data: result });

  dogstatsd.increment("api.received.updates.count", [`source:${source}`]);
  dogstatsd.histogram("api.received.updates.bytes", req.bodyByteLength, [
    `source:${source}`,
  ]);
};

// TODO
// export async function listAvailabilityStream(req: AppRequest, res: Response) {}
// }

/**
 * List all current availability statuses.
 */
export const listAvailability = async (
  request: AppRequest,
  response: Response
): Promise<void> => {
  const includePrivate = shouldIncludePrivate(request);
  let { limit, pageNext } = Pagination.getParameters(request);
  limit = limit || 2000;

  let dbQuery = db.db("availability").orderBy("id", "asc").limit(limit);
  if (pageNext) dbQuery = dbQuery.where("id", ">", pageNext);
  if (!includePrivate) dbQuery = dbQuery.where("is_public", true);

  const data = await dbQuery;
  const lastItem = data.at(-1);

  withSpan("writeJson", () => {
    response.json({
      links: Pagination.createLinks(request, { next: lastItem?.id }),
      data,
    });
  });
};
