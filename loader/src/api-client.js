const got = require("got");
const config = require("./config");
const packageInfo = require("../package.json");

class ApiClient {
  static fromEnv () {
    if (!config.apiUrl || !config.apiKey) {
      throw new Error("You must set the `API_URL` and `API_KEY` environment variables.");
    }
    return new ApiClient(config.apiUrl, config.apiKey);
  }

  constructor (url, key) {
    if (!url || !key) throw new Error("You must set an API URL and key");

    if (url.endsWith("/")) url = url.slice(0, -1);
    this.url = url;
    this.key = key;
    this.userAgent = `appointment-availability-loader/${packageInfo.version}`;
  }

  async getLocations (query) {
    const { body } = await got({
      url: `${this.url}/locations`,
      searchParams: query,
      headers: {
        "x-api-key": this.key,
        "User-Agent": this.userAgent,
      },
      responseType: "json"
    });
    return body;
  }

  async sendUpdate (data) {
    const response = await got.post({
      url: `${this.url}/update`,
      headers: {
        "x-api-key": this.key,
        "User-Agent": this.userAgent,
      },
      json: data,
      responseType: "json",
      throwHttpErrors: false
    });

    const body = response.body;
    // TODO: should probably always include success in response on API side?
    if (body.error || body.success === false) {
      body.success = false;
      body.sent = data;
      body.statusCode = response.statusCode;
    }

    return body;
  }
}

module.exports = ApiClient;
