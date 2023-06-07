const nock = require("nock");
const { RequestError } = require("got");
const { ParseError, GraphQlError, HttpApiError } = require("../src/exceptions");
const { VaccineProduct } = require("../src/model");
const {
  httpClient,
  queryGraphQl,
  splitOnce,
  filterObject,
  unpadNumber,
  getUniqueExternalIds,
  RateLimit,
  parseUsPhoneNumber,
  cleanUrl,
  matchVaccineProduct,
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

describe("queryGraphQl", () => {
  const baseQuery = {
    query: "<no a real query>",
    retry: {
      calculateDelay: ({ computedValue }) => (computedValue > 0 ? 1 : 0),
    },
  };

  afterEach(() => {
    nock.cleanAll();
  });

  it("does not retry successful requests", async () => {
    const responder = nock("https://example.com")
      .post("/")
      .reply(200, { data: [{ ok: "yes" }] });

    let retryChecks = 0;
    const response = await queryGraphQl("https://example.com/", {
      ...baseQuery,
      retryIf(_error) {
        retryChecks++;
        return true;
      },
    });
    expect(response).toHaveProperty("retryCount", 0);
    expect(retryChecks).toEqual(0);
    responder.done();
  });

  it("consults retryIf for GraphQl errors", async () => {
    const responder = nock("https://example.com")
      .post("/")
      .times(3)
      .reply(200, { errors: [{ message: "Oh no" }] });

    let retryChecks = 0;
    await expect(
      queryGraphQl("https://example.com/", {
        ...baseQuery,
        retryIf(error) {
          retryChecks++;
          return /oh no/i.test(error.message);
        },
      })
    ).rejects.toThrow(GraphQlError);
    expect(retryChecks).toEqual(2);
    responder.done();
  });

  it("retries automatically on 5xx errors", async () => {
    const responder = nock("https://example.com")
      .post("/")
      .times(3)
      .reply(500, { errors: [{ message: "Oh no" }] });

    let retryChecks = 0;
    await expect(
      queryGraphQl("https://example.com/", {
        ...baseQuery,
        retryIf(_error) {
          retryChecks++;
          return true;
        },
      })
    ).rejects.toThrow(GraphQlError);
    expect(retryChecks).toEqual(0);
    responder.done();
  });

  it("retries automatically on network errors", async () => {
    const responder = nock("https://example.com")
      .post("/")
      .times(3)
      .replyWithError({ code: "ECONNRESET" });

    let retryChecks = 0;
    await expect(
      queryGraphQl("https://example.com/", {
        ...baseQuery,
        retryIf(_error) {
          retryChecks++;
          return true;
        },
      })
    ).rejects.toThrow(RequestError);
    expect(retryChecks).toEqual(0);
    responder.done();
  });

  it("throws an HTTP error for non-GraphQL error responses", async () => {
    const responder = nock("https://example.com")
      .post("/")
      .reply(400, "The is not a GraphQL-formatted error!");

    await expect(
      queryGraphQl("https://example.com/", baseQuery)
    ).rejects.toThrow(HttpApiError);
    responder.done();
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
    expect(callTimes[1] - callTimes[0]).toBeGreaterThanOrEqual(995);
    expect(callTimes[1] - callTimes[0]).toBeLessThan(1050);
    expect(callTimes[2] - callTimes[1]).toBeGreaterThanOrEqual(995);
    expect(callTimes[2] - callTimes[1]).toBeLessThan(1050);
  });
});

describe("parseUsPhoneNumber", () => {
  it("Parses phone numbers", () => {
    expect(parseUsPhoneNumber("(213) 456-7890")).toEqual("(213) 456-7890");
  });

  it("Handles country codes", () => {
    expect(parseUsPhoneNumber("+1 (213) 456-7890")).toEqual("(213) 456-7890");
    expect(parseUsPhoneNumber("1 (213) 456-7890")).toEqual("(213) 456-7890");
  });

  it("Works with or without parentheses for the area code", () => {
    expect(parseUsPhoneNumber("213 456-7890")).toEqual("(213) 456-7890");
  });

  it("Handles different separators", () => {
    expect(parseUsPhoneNumber("213.456.7890")).toEqual("(213) 456-7890");
  });

  it("Handles missing leading zeroes", () => {
    expect(parseUsPhoneNumber("213.456.789")).toEqual("(213) 456-0789");
  });

  it("throws for invalid numbers", () => {
    // US area codes cannot start with "1".
    expect(() => parseUsPhoneNumber("123.456.7890")).toThrow(ParseError);
    // Too many numbers.
    expect(() => parseUsPhoneNumber("213.456.78901")).toThrow(ParseError);

    expect(() => parseUsPhoneNumber("Not a number")).toThrow(ParseError);
  });
});

describe("cleanUrl", () => {
  it("returns valid URLs as-is", () => {
    let url = "https://something.com/yeah";
    expect(cleanUrl(url)).toBe(url);

    url = "https://deep.deep.subdomain.something.com/yeah?ok=sure";
    expect(cleanUrl(url)).toBe(url);
  });

  it("adds a scheme to URLs that are missing one", () => {
    expect(cleanUrl("whatever.com")).toBe("http://whatever.com");
  });

  it("strips leading and trailing spaces", () => {
    expect(cleanUrl("  http://whatever.com ")).toBe("http://whatever.com");
  });

  it("returns undefined for empty input values", () => {
    expect(cleanUrl(null)).toBe(undefined);
    expect(cleanUrl("")).toBe(undefined);
    expect(cleanUrl("    ")).toBe(undefined);
  });

  it("throws for values that are not URL-like", () => {
    expect(() => cleanUrl("not a URL")).toThrow(ParseError);
    expect(() => cleanUrl("http://no-second-level-domain")).toThrow(ParseError);
    expect(() =>
      cleanUrl("http://example.com/path with some other text after the URL")
    ).toThrow(ParseError);
  });
});

describe("matchVaccineProduct", () => {
  // Test real strings we've seen from various sources.
  const v = VaccineProduct;
  // prettier-ignore
  it.each([
    [v.janssen, "Janssen COVID-19 Vaccine"],
    [v.janssen, "Janssen (J&J) COVID-19 Vaccine/Booster (Ages 18+)"],
    [v.janssen, "Janssen"],

    [v.moderna, "Moderna"],
    [v.moderna, "Moderna COVID-19 Vaccine"],
    [v.moderna, "Moderna Booster COVID-19 Vaccine"],
    [v.moderna, "Moderna COVID-19 Vaccine/Booster (Ages 18+)"],
    [v.moderna, "Moderna COVID-19 Vaccine (Ages 12+)"],
    [v.moderna, "Moderna (Spikevax), ages 12 years and up"],
    [v.moderna, "Moderna COVID-19 Vaccine (Ages 6+)"],

    [v.modernaBa4Ba5, "Moderna COVID-19 Vaccine (Ages 12+)/Bivalent Booster (Ages 18+)"],
    [v.modernaBa4Ba5, "Moderna COVID-19, Bivalent Booster (Ages 18+)"],
    [v.modernaBa4Ba5, "Moderna bivalent booster, ages 12 years and up"],
    [v.modernaBa4Ba5, "Moderna COVID-19 Bivalent Booster (Ages 6+)"],
    [v.modernaBa4Ba5, "Moderna COVID-19, Bivalent (Ages 6mo+ blue)"],

    [v.modernaAge6_11, "Moderna COVID-19 Vaccine (ages 6-11 Primary, 18+ Booster)"],
    [v.modernaAge6_11, "Moderna Pediatric COVID-19 Vaccine (Ages 6 through 11)"],

    [v.modernaAge0_5, "Moderna Pediatric COVID-19 Vaccine (Ages 6 months - 5 years)"],
    [v.modernaAge0_5, "Moderna Pediatric COVID-19 Vaccine (Ages 6 months through 5 years)"],
    [v.modernaAge0_5, "Moderna COVID-19 Vaccine (Ages 6m-5yrs)"],

    [v.modernaBa4Ba5Age0_5, "Moderna COVID-19 Bivalent Booster (Ages 6m - 5yrs)"],

    [v.pfizer, "Pfizer-BioNTech"],
    [v.pfizer, "Pfizer-BioNTech COVID-19 Vaccine (Ages 12+)"],
    [v.pfizer, "Pfizer-BioNTech COVID-19 Vaccine/Booster (Ages 12+)"],
    [v.pfizer, "Comirnaty COVID-19 Vaccine/Booster (Ages 12+)"],

    [v.pfizerBa4Ba5, "Pfizer-BioNTech COVID-19 Vaccine/Bivalent Booster (Ages 12+)"],
    [v.pfizerBa4Ba5, "Pfizer COVID-19, Bivalent Booster (Ages 12+)"],
    [v.pfizerBa4Ba5, "Pfizer-BioNTech bivalent booster, ages 12 years and up"],

    [v.pfizerAge5_11, "Pediatric-Pfizer (5-11)"],
    [v.pfizerAge5_11, "Pfizer COVID-19 Vaccine (Ages 5-11)"],
    [v.pfizerAge5_11, "Pfizer-BioNTech Pediatric COVID-19 Vaccine/Booster (Ages 5 - 11)"],
    [v.pfizerAge5_11, "Pfizer-BioNTech Pediatric COVID-19 Vaccine/Booster (Ages 5 through 11)"],

    [v.pfizerAge0_4, "Pfizer-BioNTech Pediatric COVID-19 Vaccine (Ages 6 months - 4 years)"],
    [v.pfizerAge0_4, "Pfizer-BioNTech Pediatric COVID-19 Vaccine (Ages 6 months through 4 years)"],
    [v.pfizerAge0_4, "Pfizer-BioNTech COVID-19 Vaccine (Ages 6m-4yrs)"],

    [v.novavax, "Novavax COVID-19 Vaccine (Ages 12+)"],
    [v.novavax, "Novavax COVID-19 Vaccine 12+"],

    // Unpredicted pediatric types for Moderna/Pfizer
    [undefined, "Moderna Pediatric COVID Ages 3 - 9"],
    [undefined, "Pfizer Pediatric COVID Ages 3 - 9"],

    // Not COVID Vaccines
    [undefined, "Varicella (chickenpox)"],
    [undefined, "Influenza (Flu)"],
  ])('matches %s: "%s"', (expected, text) => {
    expect(matchVaccineProduct(text)).toBe(expected);
  });
});
