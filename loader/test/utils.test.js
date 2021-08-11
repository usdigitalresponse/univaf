const { splitOnce } = require("../src/utils");

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
