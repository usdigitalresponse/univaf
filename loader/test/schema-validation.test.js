const { SchemaError, assertSchema } = require("../src/schema-validation");

describe("assertSchema", () => {
  it("does nothing if an object matches the schema", () => {
    const schema = {
      type: "object",
      properties: {
        aNumber: { type: "number" },
      },
    };

    assertSchema(schema, { aNumber: 5 });
  });

  it("throws SchemaError for validation failures", () => {
    const schema = {
      type: "object",
      properties: {
        aNumber: { type: "number" },
      },
    };

    expect(() => {
      assertSchema(schema, { aNumber: "hello" });
    }).toThrow(SchemaError);
  });
});
