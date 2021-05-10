import got from "got";
import app from "../src/app";
import { testClient } from "./lib";

describe("GET /", function () {
  it("should return 200 OK", async () => {
    const res = await testClient(app, { responseType: "text" }).get("");
    expect(res.statusCode).toBe(200);
  });
});
