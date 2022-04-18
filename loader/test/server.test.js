const got = require("got");
const nock = require("nock");
const { runServer } = require("../src/server");

describe("Server", () => {
  let server;

  beforeEach(async () => {
    nock.enableNetConnect("localhost");
  });

  afterEach((done) => {
    nock.cleanAll();
    nock.enableNetConnect();

    if (server) server.close(done);
    else done();
  });

  it("runs the provided function", async () => {
    const mockRunner = jest.fn((_) => Promise.resolve(true));
    server = runServer(mockRunner);
    const response = await got.post({
      url: "http://localhost:3010/",
      json: {},
    });

    expect(mockRunner.mock.calls.length).toBe(1);
    expect(response.statusCode).toBe(200);
  });

  it("passes in the post body", async () => {
    const mockRunner = jest.fn((_) => Promise.resolve(true));
    server = runServer(mockRunner);
    await got.post({
      url: "http://localhost:3010/",
      json: { sources: ["example"] },
    });

    expect(mockRunner.mock.calls[0][0]).toEqual({
      sources: ["example"],
      // Plus some defaults:
      compact: true,
      send: true,
    });
  });

  it("returns a 500 error if the function returns false", async () => {
    const mockRunner = jest.fn((_) => Promise.resolve(false));
    server = runServer(mockRunner);
    const response = await got.post({
      url: "http://localhost:3010/",
      throwHttpErrors: false,
    });

    expect(response.statusCode).toBe(500);
  });

  it("returns a 500 error if the function fails", async () => {
    const mockRunner = jest.fn((_) => Promise.reject(new Error("OH NO")));
    server = runServer(mockRunner);
    const response = await got.post({
      url: "http://localhost:3010/",
      throwHttpErrors: false,
    });

    expect(response.statusCode).toBe(500);
  });

  it("returns a 400 error if body was invalid", async () => {
    const mockRunner = jest.fn((_) => Promise.resolve(true));
    server = runServer(mockRunner);
    const response = await got.post({
      url: "http://localhost:3010/",
      body: ",",
      throwHttpErrors: false,
    });

    expect(response.statusCode).toBe(400);
  });
});
