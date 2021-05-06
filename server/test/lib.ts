import { Server as HttpsServer } from "https";
import got from "got";

interface ServerTest {
  describe: (description: string, fn: Function) => void;
}

export function serverTest(app: any): ServerTest {
  return {
    describe: function (description: string, fn: Function) {
      describe(description, function () {
        beforeEach((done) => {
          this.server = app.listen(0, () => {
            this.client = got.extend({
              prefixUrl: `http://127.0.0.1:${this.server.address().port}`,
              responseType: "json",
            });
            done();
          });
        });

        afterEach((done) => {
          const port = this.server.address().port;
          if (this.server) {
            this.server.close((error?: Error) => {
              // Jest needs a tick after server shutdown to detect
              // that the resources have been released.
              setTimeout(() => done(error), 0);
            });
          } else {
            done();
          }
        });

        fn.bind(this)();
      });
    },
  };
}
