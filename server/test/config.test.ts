import { afterEach, describe, expect, it } from "@jest/globals";
import { getApiKeys, getPrimaryHost } from "../src/config";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("getApiKeys", () => {
  it("gets the value of API_KEYS as an array", () => {
    process.env.API_KEYS = "key1, key2";
    expect(getApiKeys()).toEqual(["key1", "key2"]);
  });

  it("throws if keys are not set in a production environment", () => {
    process.env.API_KEYS = "";
    process.env.NODE_ENV = "production";
    expect(() => getApiKeys()).toThrow();
  });

  it("returns a default if keys are not set outside a production environment", () => {
    process.env.API_KEYS = "";
    expect(getApiKeys()).toBeInstanceOf(Array);
    expect(getApiKeys()).toHaveLength(1);
  });
});

describe("getPrimaryHost", () => {
  it("gets the value of PRIMARY_HOST", () => {
    process.env.PRIMARY_HOST = "test-host.name:123";
    expect(getPrimaryHost()).toBe("test-host.name:123");
  });

  it("returns null if PRIMARY_HOST is not set", () => {
    process.env.PRIMARY_HOST = "";
    expect(getPrimaryHost()).toBeNull();

    delete process.env.PRIMARY_HOST;
    expect(getPrimaryHost()).toBeNull();
  });

  it("throws if PRIMARY_HOST is not a valid value", () => {
    process.env.PRIMARY_HOST = "not-ok!";
    expect(() => getPrimaryHost()).toThrow(TypeError);
  });
});
