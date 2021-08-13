import * as Sentry from "@sentry/node";

module.exports = async () => {
  console.log("HELLO FROM GLOBAL TEARDOWN");
  const result = await Sentry.close();
  console.log(`DONE WITH GLOBAL TEARDOWN. Sentry closed? ${result}`);
};
