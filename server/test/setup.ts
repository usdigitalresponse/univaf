import * as Sentry from "@sentry/node";

afterAll(async () => {
  const result = await Sentry.close();
  console.log(`DONE WITH TEST TEARDOWN. Sentry closed? ${result}`);
});

// No-op to make TypeScript happy
module.exports = async () => {};
