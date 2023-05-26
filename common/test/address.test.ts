import { describe, it, expect } from "@jest/globals";
import { parseUsAddress } from "../src/address";
import { ParseError } from "../src/exceptions";

describe("parseUsAddress", () => {
  it("Parses simple addresses", () => {
    const parsed = parseUsAddress("3524 Somewhere St., Nowhere, NV 90210");
    expect(parsed).toEqual({
      lines: ["3524 Somewhere St."],
      city: "Nowhere",
      state: "NV",
      zip: "90210",
    });
  });

  it("Throws on invalid addresses", () => {
    expect(() => {
      parseUsAddress("Not an address or address-like string");
    }).toThrow(ParseError);
  });

  it("Throws on invalid addresses that are structured like addresses", () => {
    expect(() => {
      parseUsAddress("., ., TX, 75244");
    }).toThrow(ParseError);
  });
});
