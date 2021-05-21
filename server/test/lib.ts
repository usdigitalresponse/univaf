import type { AddressInfo } from "net";
import type { Application } from "express";
import type { Server } from "http";
import got, { Got } from "got";

import { db } from "../src/db";
import { availabilityDb } from "../src/availability-log";
import { Knex, knex } from "knex";

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
        throwHttpErrors: false,
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
  // Wait for all promises to settle, but reject afterward if at
  // least one of them rejected.
  function allResolved(promises: Promise<void>[]) {
    return Promise.allSettled(promises).then(
      (
        results: Array<PromiseFulfilledResult<void> | PromiseRejectedResult>
      ) => {
        for (const result of results) {
          if (result.status === "rejected") throw result.reason;
        }
      }
    );
  }

  const conns: Knex[] = [db, availabilityDb];
  afterAll(async () => {
    await allResolved(conns.map((c) => c.destroy()));
  });
  beforeEach(async () => {
    await allResolved(conns.map((c) => c.raw("BEGIN")));
  });
  afterEach(async () => {
    await allResolved(conns.map((c) => c.raw("ROLLBACK")));
  });

  mockDbTransactions();
}

function mockDbTransactions() {
  // mock out db.transaction since we only use one connection when testing
  // we use defineProperty here because it's defined as read-only
  Object.defineProperty(db, "transaction", {
    value: async (f: Function) => {
      return await f(db);
    },
  });
}
