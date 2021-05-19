import type { AddressInfo } from "net";
import type { Application } from "express";
import type { Server } from "http";
import got, { Got } from "got";

import { db, clearTestDatabase } from "../src/db";
import { availabilityDb } from "../src/availability-log";

interface Context {
  server?: Server;
  client?: Got;
}

export function useServerForTests(app: Application): Context {
  const context: Context = {};

  beforeEach((done) => {
    context.server = app.listen(0, () => {
      const { port } = context.server.address() as AddressInfo;
      app.set("port", port);
      context.client = got.extend({
        prefixUrl: `http://127.0.0.1:${port}`,
        responseType: "json",
      });
      done();
    });
  });

  afterEach((done) => {
    if (context.server) {
      context.server.close((error?: Error) => {
        // Jest needs a tick after server shutdown to detect
        // that the resources have been released.
        setTimeout(() => done(error), 0);
      });
    } else {
      done();
    }
  });

  return context;
}

export function installTestDatabaseHooks() {
  beforeAll(clearTestDatabase);
  // Wait for all promises to settle, but reject afterward if at
  // least one of them rejected.
  function allResolved(promises) {
    return Promise.allSettled(promises).then((results) => {
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
      }
    });
  }
  afterAll(async () => {
    await allresolved([
      db.destroy(),
      availabilityDb.destroy()
    ]);
  });
  beforeEach(async () => {
    await allresolved([
      db.raw("BEGIN"),
      availabilityDb.raw("BEGIN")
    ]);
  });
  afterEach(async () => {
    await allresolved([
      db.raw("ROLLBACK"),
      availabilityDb.raw("ROLLBACK")
    ]);
  });
}
