import * as Sentry from "@sentry/node";

module.exports = async () => {
  console.log("HELLO FROM GLOBAL TEARDOWN");
  await Sentry.close();
  console.log("DONE WITH GLOBAL TEARDOWN");
};
