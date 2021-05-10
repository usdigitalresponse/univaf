import app from "../src/app";
import { useServerForTests } from "./lib";

describe("GET /", function () {
  const context = useServerForTests(app);
  it("should return 200 OK", async () => {
    const res = await context.client.extend({ responseType: "text" }).get("");
    expect(res.statusCode).toBe(200);
  });
});
