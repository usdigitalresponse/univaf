import { Request } from "express";

export function getApiKeys(): Array<string> {
  let keyList = process.env.API_KEYS;
  if (!keyList) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "You must set API_KEYS to a comma-separated list of keys in production"
      );
    } else {
      keyList = "dev-key";
    }
  }

  return keyList.split(",").map((key) => key.trim());
}

export function getHostUrl(request?: Request): string {
  let hostUrl = process.env.HOST_URL;
  if (!hostUrl) {
    if (!request) {
      throw new Error("Cannot calculate host URL without a request");
    } else {
      const port = request.app.get("port");
      hostUrl = `${request.protocol}://${request.hostname}:${port}`;
    }
  }
  if (hostUrl.endsWith("/")) hostUrl = hostUrl.slice(0, -1);

  return hostUrl;
}

export function loadDbConfig() {
  const knexfile = require("../knexfile");
  const nodeEnv = process.env.NODE_ENV || "development";
  return knexfile[nodeEnv];
}
