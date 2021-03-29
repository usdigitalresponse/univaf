export function getApiKeys (): Array<string> {
  let keyList = process.env.API_KEYS;
  if (!keyList) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("You must set API_KEYS to a comma-separated list of keys in production");
    }
    else {
      keyList = "dev-key";
    }
  }

  return keyList.split(",").map(key => key.trim());
}
