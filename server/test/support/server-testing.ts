import type { AddressInfo } from "net";
import type { Application } from "express";
import type { Server } from "http";
import got, { Got } from "got";

interface Context {
  server?: Server;
  client?: Got;
}

/**
 * Set up hooks to start the application server on a random port before each
 * test and tear it down after the test. This function returns a `Context`
 * object with information about the server and a pre-configured instance of
 * `got` that will connect to that server.
 * @param app The application object to start a server for.
 *
 * @example
 * import { useServerForTests } from "./support/server-testing"
 *
 * describe("A test suite", () => {
 *   const context = useServerForTests(app);
 *
 *   it("should do something", () => {
 *     const response = await context.client.get<any>("some/path");
 *     expect(response).toHaveProperty("statusCode", 200);
 *   });
 * });
 */
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
        setTimeout(() => done(error), 10);
      });
    } else {
      done();
    }
  });

  return context;
}
