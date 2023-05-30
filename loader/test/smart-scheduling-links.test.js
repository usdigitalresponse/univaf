const { Readable } = require("node:stream");
const nock = require("nock");
const {
  valuesAsObject,
  getExtensions,
  formatExternalIds,
  sourceReference,
  SmartSchedulingLinksApi,
} = require("../src/smart-scheduling-links");

jest.mock("../src/logging");

describe("smart-scheduling-links", () => {
  describe("valuesAsObject", () => {
    it("should combine a list of FHIR values into an object", () => {
      const result = valuesAsObject([
        { system: "phone", value: "1-800-555-1234" },
        { system: "url", value: "https://walgreens.com/" },
        { system: "phone", value: "1-800-555-6789" },
      ]);
      expect(result).toEqual({
        phone: "1-800-555-1234",
        url: "https://walgreens.com/",
      });
    });

    it("should support alternative key names", () => {
      const result = valuesAsObject(
        [
          { url: "phone", value: "1-800-555-1234" },
          { url: "url", value: "https://walgreens.com/" },
        ],
        "url"
      );
      expect(result).toEqual({
        phone: "1-800-555-1234",
        url: "https://walgreens.com/",
      });
    });

    it("should support a variety of value types", () => {
      const result = valuesAsObject([
        {
          system: "systemA",
          valueUrl: "https://walgreens.com/covid/20134",
        },
        {
          system: "systemB",
          valueString: "1-800-555-1234",
        },
        {
          system: "systemC",
          valueInteger: 15,
        },
      ]);
      expect(result).toEqual({
        systemA: "https://walgreens.com/covid/20134",
        systemB: "1-800-555-1234",
        systemC: 15,
      });
    });
  });

  describe("getExtensions", () => {
    it("returns an object describing the extensions", () => {
      const dataObject = {
        extension: [
          { url: "http://abc.com/x", valueString: "Hello" },
          { url: "http://abc.com/y", valueInteger: 5 },
        ],
      };
      // Get the extensions in a simpler form:
      expect(getExtensions(dataObject)).toEqual({
        "http://abc.com/x": "Hello",
        "http://abc.com/y": 5,
      });
    });
  });

  describe("formatExternalIds", () => {
    it("converts FHIR identifiers into UNIVAF-style external IDs", () => {
      const location = {
        identifier: [
          {
            system: "https://cdc.gov/vaccines/programs/vtrcks",
            value: "abc123",
          },
          {
            system: "http://hl7.org/fhir/sid/us-npi",
            value: "1598055964",
          },
          {
            system: "https://walgreens.com",
            value: "13656",
          },
        ],
      };

      expect(formatExternalIds(location)).toEqual([
        ["vtrcks", "abc123"],
        ["npi_usa", "1598055964"],
        ["https://walgreens.com", "13656"],
      ]);
    });

    // Each of these values for a VTrckS identifier should be treated as if the
    // identifier is not present at all.
    it.each(["unknown VTrckS pin for 13656", "", "null"])(
      "filters out non-entries for VTrckS",
      (nonValue) => {
        const location = {
          identifier: [
            {
              system: "https://cdc.gov/vaccines/programs/vtrcks",
              value: nonValue,
            },
          ],
        };

        expect(formatExternalIds(location)).toEqual([]);
      }
    );

    it("includes the FHIR location ID when smartIdName is set", () => {
      const location = {
        id: "123",
        identifier: [
          {
            system: "http://hl7.org/fhir/sid/us-npi",
            value: "1598055964",
          },
        ],
      };

      expect(formatExternalIds(location, { smartIdName: "fhirId" })).toEqual([
        ["fhirId", "123"],
        ["npi_usa", "1598055964"],
      ]);
    });

    it("allows customizing unknown entries with formatUnknownId", () => {
      const location = {
        identifier: [
          {
            system: "http://example.com/unknown",
            value: "1598055964",
          },
          {
            system: "http://example.com/unknown2",
            value: "abc",
          },
        ],
      };

      expect(
        formatExternalIds(location, {
          formatUnknownId({ system, value }) {
            if (system === "http://example.com/unknown") return ["x", value];
            return [system, value];
          },
        })
      ).toEqual([
        ["x", "1598055964"],
        ["http://example.com/unknown2", "abc"],
      ]);
    });
  });

  describe("SmartSchedulingLinksApi", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("only loads manifest entries for the requested states", async () => {
      const manifest = {
        transactionTime: "2021-05-17T16:41:05.534Z",
        request: `http://example.com/manifest.json`,
        output: [
          {
            type: "Location",
            url: "http://example.com/l/test1.ndjson",
            extension: { state: ["DE", "NJ"] },
          },
          {
            type: "Location",
            url: "http://example.com/l/test2.ndjson",
            extension: { state: ["CA", "OR"] },
          },

          // Entries where the state is inferred instead of explicit.
          { type: "Location", url: "http://example.com/l/NJ.ndjson" },
          { type: "Location", url: "http://example.com/l/CA.ndjson" },

          // Shuld always be loaded because the state is unknown.
          { type: "Location", url: "http://example.com/l/test3.ndjson" },
        ],
        error: [],
      };

      nock("http://example.com").get("/manifest.json").reply(200, manifest);
      nock("http://example.com")
        .get("/l/test1.ndjson")
        .reply(200, `{"source": "test1.ndjson"}`);
      nock("http://example.com")
        .get("/l/NJ.ndjson")
        .reply(200, `{"source": "NJ.ndjson"}`);
      nock("http://example.com")
        .get("/l/test3.ndjson")
        .reply(200, `{"source": "test3.ndjson"}`);

      const client = new SmartSchedulingLinksApi(
        "http://example.com/manifest.json"
      );
      const locations = await Readable.from(
        client.listLocations(["NJ"])
      ).toArray();

      expect(locations).toEqual([
        { source: "test1.ndjson", [sourceReference]: manifest.output[0] },
        { source: "NJ.ndjson", [sourceReference]: manifest.output[2] },
        { source: "test3.ndjson", [sourceReference]: manifest.output[4] },
      ]);
      expect(nock.isDone()).toBe(true);
    });
  });
});
