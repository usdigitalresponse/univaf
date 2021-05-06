import got from "got";
import app from "../src/app";
import { serverTest } from "./lib";

serverTest(app).describe("GET /", function () {
  it("should return 200 OK", async () => {
    const res = await this.client.extend({ responseType: "text" }).get("");
    expect(res.statusCode).toBe(200);
  });
});
