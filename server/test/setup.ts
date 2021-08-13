import * as Sentry from "@sentry/node";

afterAll(async () => {
  await Sentry.close(2000);
});

// No-op to make TypeScript happy
module.exports = async () => {};
