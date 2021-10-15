const nock = require("nock");
const { httpClient, splitOnce } = require("../src/utils");

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
