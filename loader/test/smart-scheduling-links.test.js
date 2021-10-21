const {
  valuesAsObject,
  getExtensions,
  formatExternalIds,
} = require("../src/smart-scheduling-links");

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

    it("filters out non-entries for VTrckS", () => {
      const location = {
        identifier: [
          {
            system: "https://cdc.gov/vaccines/programs/vtrcks",
            value: "unknown VTrckS pin for 13656",
          },
        ],
      };

      expect(formatExternalIds(location)).toEqual([]);

      const location2 = {
        identifier: [
          {
            system: "https://cdc.gov/vaccines/programs/vtrcks",
            value: "",
          },
        ],
      };

      expect(formatExternalIds(location2)).toEqual([]);
    });

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
});
