import { installTestDatabaseHooks, useServerForTests } from "./lib";
import { getApiKeys } from "../src/config";
import app from "../src/app";
import { createLocation, getLocationById, updateAvailability } from "../src/db";
import { TestLocation, TestLocation2 } from "./fixtures";

installTestDatabaseHooks();

const context = useServerForTests(app);

const authHeaders = {
  Accept: "application/json",
  "x-api-key": getApiKeys()[0],
};

const validErrorShape = {
  asymmetricMatch(obj: any) {
    return (
      typeof obj === "object" &&
      typeof obj.error === "object" &&
      typeof obj.error.code === "string" &&
      typeof obj.error.message === "string"
    );
  },
};

beforeEach(() => {
  // silence console.error for quieter tests
  jest.spyOn(console, "error").mockImplementation(() => {});
});

test("404 is well-formatted", async () => {
  const res = await context.client.get<any>("api/edge/MISSING");
  expect(res.statusCode).toBe(404);
  expect(res.body).toEqual(validErrorShape);
});

test("thrown ApiError is well-formatted", async () => {
  const res = await context.client.get<any>(
    "api/edge/locations/MISSING?include_private=true"
  );
  expect(res.statusCode).toBe(403);
  expect(res.body).toEqual(validErrorShape);
});

test("sendErrors(string) is well-formatted", async () => {
  const res = await context.client.get<any>("api/edge/locations/MISSING");
  expect(res.statusCode).toBe(404);
  expect(res.body).toEqual(validErrorShape);
});

test("sendErrors(ApiError) is well-formatted", async () => {
  const location = await createLocation(TestLocation);
  await updateAvailability(location.id, TestLocation.availability);

  // updating with the same availability gives OutOfDateError
  const res = await context.client.post("api/edge/update?update_location=1", {
    headers: authHeaders,
    json: {
      id: TestLocation.id,
      availability: TestLocation.availability,
    },
  });
  expect(res.statusCode).toBe(409);
  expect(res.body).toEqual(validErrorShape);
});

test("sendErrors(ValueError) is well-formatted", async () => {
  const location = await createLocation(TestLocation);

  const res = await context.client.post("api/edge/update?update_location=1", {
    headers: authHeaders,
    json: {
      id: TestLocation.id,
      availability: {
        source: "test",
        checked_at: new Date(),
        slots: [{ start: "start time" }], // Bad timestamp format
      },
    },
  });
  expect(res.statusCode).toBe(422);
  expect(res.body).toEqual(validErrorShape);
});

test("500 is well-formatted", async () => {
  const location = await createLocation(TestLocation);
  const res = await context.client.post("api/edge/update?update_location=1", {
    headers: authHeaders,
    json: {
      id: TestLocation.id,
      external_ids: 12345,
    },
  });

  expect(res.statusCode).toBe(500);
  expect(res.body).toEqual(validErrorShape);
});
