import * as Sentry from "@sentry/node";

module.exports = async () => {
  await Sentry.close();
};
