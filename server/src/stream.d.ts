import stream from "node:stream";

// The "@types/node" module is missing a declaration for stream.compose.
// See: https://github.com/DefinitelyTyped/DefinitelyTyped/discussions/58490
declare module "node:stream" {
  function compose(
    ...streams:
      | stream.Stream[]
      | Iterable<any>[]
      | AsyncIterable<any>[]
      | CallableFunction[]
  ): stream.Duplex;
}
