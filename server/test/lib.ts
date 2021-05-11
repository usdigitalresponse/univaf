import type { AddressInfo } from "net";
import type { Application } from "express";
import type { Server } from "http";
import got, { Got } from "got";

import { db, clearTestDatabase } from "../src/db";

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
  afterAll(async () => await db.destroy());
  beforeEach(async () => await db.raw("BEGIN"));
  afterEach(async () => await db.raw("ROLLBACK"));
}
