import { URL } from "url";
import app from "../src/app";
import { useServerForTests } from "./support/lib";

describe("GET /", function () {
  const context = useServerForTests(app);

  it("should redirect to docs index page", async () => {
    const res = await context.client.extend({ responseType: "text" }).get("");
    expect(new URL(res.url)).toHaveProperty("pathname", "/docs/");
    expect(res.statusCode).toBe(200);
  });
});
