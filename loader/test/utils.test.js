const nock = require("nock");
const {
  httpClient,
  splitOnce,
  filterObject,
  unpadNumber,
  getUniqueExternalIds,
  RateLimit,
} = require("../src/utils");

describe("splitOnce", () => {
  it("splits once on a single character", () => {
    expect(splitOnce("test:123", ":")).toEqual(["test", "123"]);
    expect(splitOnce("test-123-123", "-")).toEqual(["test", "123-123"]);
    expect(splitOnce("test:123", "3")).toEqual(["test:12", ""]);
    expect(splitOnce("test-123-123", "t")).toEqual(["", "est-123-123"]);
  });

  it("handles a delimiter that doesn't exist in text", () => {
    expect(splitOnce("test:123", "~")).toEqual(["test:123"]);
    expect(splitOnce("test-123", "/")).toEqual(["test-123"]);
  });

  it("handles multi-character delimiters", () => {
    expect(splitOnce("test:123", "st:")).toEqual(["te", "123"]);
    expect(splitOnce("test-123", "12")).toEqual(["test-", "3"]);
    expect(splitOnce("test-123", "test-123")).toEqual(["", ""]);
  });
});

describe("httpClient", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("sets a standard User-Agent header", async () => {
    let userAgent = null;

    nock("https://example.com")
      .get("/")
      .reply(function () {
        userAgent = this.req.headers["user-agent"];
        return [200, "OK"];
      });
    await httpClient({ url: "https://example.com/" });

    // The User Agent should be "univaf-loader/<version>" (where version is a
    // (git hash or "#.#.#"), optionally followed by a space and anything else.
    // Examples:
    //   - "univaf-loader/0.1.0"
    //   - "univaf-loader/abc123"
    //   - "univaf-loader/0.1.0 <whatever>"
    expect(userAgent).toMatch(/^univaf-loader\/[\w.]+(\s|$)/);
  });
});

describe("filterObject", () => {
  it("removes key/value pairs according to a filter function", () => {
    const result = filterObject(
      {
        a: "A Value",
        b: "B Value",
        c: "C Value",
      },
      ([key, _]) => key > "b"
    );
    expect(result).toEqual({ c: "C Value" });
  });

  it("returns a new object", () => {
    const original = {
      a: "A Value",
      b: "B Value",
      c: "C Value",
    };
    const result = filterObject(original, ([key, _]) => key > "b");
    expect(result).not.toBe(original);
    expect(original).toEqual({
      a: "A Value",
      b: "B Value",
      c: "C Value",
    });
  });
});

describe("unpadNumber", () => {
  it("removes leading zeroes from decimal strings", () => {
    expect(unpadNumber("000123")).toBe("123");
    expect(unpadNumber("123")).toBe("123");
    expect(unpadNumber("100123")).toBe("100123");
  });

  it("does not change non-decimal strings", () => {
    expect(unpadNumber("00012a3")).toBe("00012a3");
    expect(unpadNumber("0001-2-5")).toBe("0001-2-5");
  });
});

describe("getUniqueExternalIds", () => {
  it("should remove duplicate entries from an array of external IDs", () => {
    const input = [
      ["a", "1"],
      ["b", "1"],
      ["a", "1"],
    ];
    expect(getUniqueExternalIds(input)).toEqual([
      ["a", "1"],
      ["b", "1"],
    ]);
  });
});

describe("RateLimit", () => {
  it("should prevent calls more often than the given rate", async () => {
    const callTimes = [];

    const limit = new RateLimit(1);
    await limit.ready();
    callTimes.push(Date.now());
    await limit.ready();
    callTimes.push(Date.now());
    await limit.ready();
    callTimes.push(Date.now());

    // Allow for some jitter, but it should be the rate or slower.
    expect(callTimes[1] - callTimes[0]).toBeGreaterThanOrEqual(1000);
    expect(callTimes[1] - callTimes[0]).toBeLessThan(1050);
    expect(callTimes[2] - callTimes[1]).toBeGreaterThanOrEqual(1000);
    expect(callTimes[2] - callTimes[1]).toBeLessThan(1050);
  });
});
