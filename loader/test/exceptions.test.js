const { GraphQlError } = require("../src/exceptions");

describe("GraphQlError", () => {
  it("Should format a nice message aggregating all the messages", () => {
    const error = new GraphQlError({
      statusCode: 400,
      body: {
        errors: [
          { message: "First error", code: "ERROR__TYPE_1" },
          { message: "Second error", code: "ERROR__TYPE_2" },
        ],
      },
    });

    expect(error.message).toContain("First error");
    expect(error.message).toContain("Second error");
  });

  it("Should only include unique errors", () => {
    const error = new GraphQlError({
      statusCode: 400,
      body: {
        errors: [
          { message: "First error", code: "ERROR__TYPE_1" },
          { message: "Second error", code: "ERROR__TYPE_2" },
          { message: "First error", code: "ERROR__TYPE_1" },
        ],
      },
    });

    const matchCount = [...error.message.matchAll(/First error/g)].length;
    expect(matchCount).toBe(1);
  });

  it("Should indicate how many times the same error occurred", () => {
    const error = new GraphQlError({
      statusCode: 400,
      body: {
        errors: [
          { message: "First error", code: "ERROR__TYPE_1" },
          { message: "Second error", code: "ERROR__TYPE_2" },
          { message: "First error", code: "ERROR__TYPE_1" },
        ],
      },
    });

    expect(error.message).toContain("×2");
  });
});
