import { useServerForTests } from "./lib";
import app from "../src/app";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("server application", () => {
  const context = useServerForTests(app);

  it("redirects requests to PRIMARY_HOST", async () => {
    process.env.PRIMARY_HOST = "test.primary.host";
    const response = await context.client.get<any>("health", {
      followRedirect: false,
      responseType: "text",
    } as any);
    expect(response.headers.location).toBe("http://test.primary.host/health");
  });

  it("does not redirect requests if PRIMARY_HOST is not set", async () => {
    const response = await context.client.get<any>("health", {
      followRedirect: false,
      responseType: "text",
    } as any);
    expect(response.headers.location).toBeUndefined();
  });
});
