const { describe, it, expect } = require("@jest/globals");
const { parseJsonLines } = require("../src/utils");

describe("parseJsonLines", () => {
  it("returns an array of parsed objects", () => {
    const result = parseJsonLines('{"line": 1}\n{"line": 2}\n{"line": 3}');
    expect(result).toEqual([{ line: 1 }, { line: 2 }, { line: 3 }]);
  });

  it("handles malformed JSON with literal tabs in strings", () => {
    // JSON does no allow literal tabs; this *should* be "has\\tsome\\ttabs".
    const result = parseJsonLines('{"text": "has\tsome\ttabs"}');
    expect(result).toEqual([{ text: "has\tsome\ttabs" }]);
  });

  it("includes line # and failed text in parsing errors", () => {
    expect(() =>
      parseJsonLines('{"a": "b"}\n{not: valid}\n{"y": "z"}')
    ).toThrow(/line 2\b.*\{not: valid\}/);
  });
});
