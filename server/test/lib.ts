import got from "got";

export function testClient(app: any): ServerWrappedGotClient {
  return new ServerWrappedGotClient(app);
}

class ServerWrappedGotClient {
  serverPromise: Promise<any>;
  clientPromise: Promise<typeof got>;

  constructor(app: any) {
    this.serverPromise = new Promise((resolve) => {
      const server = app.listen(0, () => {
        resolve(server);
      });
    });

    this.clientPromise = this.serverPromise.then((server) => {
      return got.extend({
        prefixUrl: `http://127.0.0.1:${server.address().port}`,
        responseType: "json",
      });
    });
  }

  async _shutdownWithResult(result: any) {
    const server = await this.serverPromise;
    return new Promise<any>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error);
        resolve(result);
      });
    });
  }

  proxiedRequest(method: string) {
    return async function (...args: any) {
      const client = await this.clientPromise;
      const res = await client[method](...args);
      return this._shutdownWithResult(res);
    };
  }

  get = this.proxiedRequest("get");
  post = this.proxiedRequest("post");
  put = this.proxiedRequest("put");
}
