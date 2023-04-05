export class BaseError extends Error {
  // Ensure subclasses get an appropriate name instead of "Error". Without this,
  // console logging, `errorInstance.toString()`, and Sentry may all print
  // different things for the type of error.
  name = this.constructor.name || "Error";
}
