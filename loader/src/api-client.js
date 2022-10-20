const Queue = require("queue");
const config = require("./config");
const metrics = require("./metrics");
const { httpClient } = require("./utils");

const DEFAULT_CONCURRENCY = 10;

class ApiClient {
  static fromEnv() {
    if (!config.apiUrl || !config.apiKey) {
      throw new Error(
        "You must set the `API_URL` and `API_KEY` environment variables."
      );
    }
    return new ApiClient(config.apiUrl, config.apiKey);
  }

  constructor(url, key, httpOptions) {
    if (!url || !key) throw new Error("You must set an API URL and key");

    if (url.endsWith("/")) url = url.slice(0, -1);
    this.url = url;
    this.key = key;
    this.httpOptions = httpOptions;
  }

  async _request(options) {
    return httpClient({
      ...this.httpOptions,
      ...options,
      url: new URL(options.url, this.url).href,
      headers: { "x-api-key": this.key, ...options.headers },
      responseType: "json",
    });
  }

  async _requestAllPages(requestOptions) {
    // This gets updated on each response with the options for the next page.
    let nextOptions = requestOptions;

    const results = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { body } = await this._request(nextOptions);
      results.push(...body.data);

      if (body.links?.next) {
        nextOptions = { url: body.links.next };
      } else {
        break;
      }
    }
    return results;
  }

  async getLocations(query) {
    return this._requestAllPages({
      url: "/api/edge/locations",
      searchParams: query,
    });
  }

  async sendUpdate(data, options) {
    if (options != null && typeof options !== "object") {
      throw new TypeError("`options` must be an object");
    }

    const response = await this._request({
      method: "POST",
      url: "/api/edge/update",
      searchParams: options,
      json: data,
      throwHttpErrors: false,
      retry: {
        // POST is not retried by default, so we need to explicitly opt in.
        methods: ["POST"],
        // Retry for gateway-related status codes (i.e. this request probably
        // never made it from a load balancer/cache/etc. to the server).
        statusCodes: [502, 503, 504, 521, 522, 524],
      },
    });

    const body = response.body;
    // TODO: should probably always include success in response on API side?
    if (body.error || body.success === false) {
      body.success = false;
      body.sent = data;
      body.statusCode = response?.statusCode ?? 600;
    }

    metrics.increment("loader.jobs.send.retries", response.retryCount);

    return body;
  }

  /**
   * Create a queue for sending updates. Use this to manage concurrency,
   * throttling, etc. if you are planning to send lots of updates in rapid
   * succession.
   * @param {number} [concurrency] Number of concurrent updates to send
   * @returns {UpdateQueue}
   */
  updateQueue(concurrency) {
    return new UpdateQueue(this, {
      concurrency: concurrency || config.apiConcurrency,
    });
  }
}

class UpdateQueue extends Queue {
  constructor(client, options = {}) {
    if (!options.concurrency) options.concurrency = DEFAULT_CONCURRENCY;

    super({
      autostart: true,
      ...options,
      results: [],
    });
    this.client = client;
  }

  /**
   * Add an update to the queue. Returns a promise that resolves when the
   * update has been completed.
   * @param {any} update The update to send
   * @param {any} [options] Any request options to set for the update
   * @returns {Promise}
   */
  async push(update, options) {
    return await super.push(() => {
      return this.client
        .sendUpdate(update, options)
        .catch((error) => ({ success: false, sent: update, error }));
    });
  }

  /**
   * An array of the results of all the sent updates.
   * @returns {Array<any>}
   */
  get allResults() {
    return this.results.map((entry) => entry && entry[0]);
  }

  /**
   * Wait for all queued updates to be completed. Returns a promise that
   * resolves to an array with the results of the updates.
   * @returns {Promise<Array<any>>}
   */
  whenDone() {
    if (!this.length) return Promise.resolve(this.allResults);

    return new Promise((resolve, reject) => {
      this.on("end", (error) => {
        if (error) return reject(error);

        return resolve(this.allResults);
      });
    });
  }
}

module.exports = {
  ApiClient,
  UpdateQueue,
};
