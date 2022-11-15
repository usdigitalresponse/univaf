import { isDeepStrictEqual } from "node:util";
import { expect } from "@jest/globals";
import type { MatcherFunction } from "expect";

// NOTE: if you update this doc comment, update the copies in the type
// definitions below! Sadly, there's no way to tell TypeScript to take it from
// the docs for this function.
/**
 * Expect an iterable to have exactly the same items as an expected list.
 * Items can occur in any order, but must occur the same number of times as
 * the expected values.
 *
 * @example
 * // Passes
 * expect(["b", {x: "y"}, "a"]).toEqualUnordered([{x: "y"}, "a", "b"]);
 * // Fails
 * expect(["b", "a", "a"]).toEqualUnordered(["a", "b"]);
 *
 * // Passes
 * expect({
 *   a: ["x", "y", "x"]
 * }).toEqual({
 *   a: expect.toEqualUnordered(["x", "x", "y"])
 * });
 * // Fails
 * expect({
 *   a: ["x", "y", "x"]
 * }).toEqual({
 *   a: expect.toEqualUnordered(["x", "y"])
 * });
 */
const toEqualUnordered: MatcherFunction<[expected: unknown]> = function (
  received: any,
  expected: any
) {
  if (!received?.[Symbol.iterator]) {
    throw new Error(`Received value (${received}) was not iterable`);
  }
  if (!expected?.[Symbol.iterator]) {
    throw new Error(`Expected value (${expected}) was not iterable`);
  }

  // `this.equals` is only available when a matcher is used in a
  // non-asymmetric context (that is, `expect(x).toEqualUnordered(y)`, but not
  // `expect.toEqualUnordered(y)`). So we implement our own comparison.
  // That is, we can't do:
  //   let pass = this.equals(receivedItems, expectedItems);
  //
  // Sadly, this also means we can't have nested asymmetic matchers. :(
  // See: https://github.com/facebook/jest/issues/8295
  const receivedItems = [...received].sort();
  const expectedItems = [...expected].sort();
  const pass = isDeepStrictEqual(receivedItems, expectedItems);

  return {
    pass,
    message() {
      const not = pass ? "" : "not ";
      return `expected ${received} ${not}to have items ${expected}`;
    },
  };
};

// Register the matcher for access via `expect.<whatever>()`.
expect.extend({
  toEqualUnordered,
});

// Register types so TypeScript knows what `expect.<whatever>()` is.
declare module "expect" {
  interface AsymmetricMatchers {
    /**
     * Expect an iterable to have exactly the same items as an expected list.
     * Items can occur in any order, but must occur the same number of times as
     * the expected values.
     *
     * @example
     * // Passes
     * expect(["b", {x: "y"}, "a"]).toEqualUnordered([{x: "y"}, "a", "b"]);
     * // Fails
     * expect(["b", "a", "a"]).toEqualUnordered(["a", "b"]);
     *
     * // Passes
     * expect({
     *   a: ["x", "y", "x"]
     * }).toEqual({
     *   a: expect.toEqualUnordered(["x", "x", "y"])
     * });
     * // Fails
     * expect({
     *   a: ["x", "y", "x"]
     * }).toEqual({
     *   a: expect.toEqualUnordered(["x", "y"])
     * });
     */
    toEqualUnordered(members: Array<any> | Set<any>): void;
  }
  interface Matchers<R> {
    /**
     * Expect an iterable to have exactly the same items as an expected list.
     * Items can occur in any order, but must occur the same number of times as
     * the expected values.
     *
     * @example
     * // Passes
     * expect(["b", {x: "y"}, "a"]).toEqualUnordered([{x: "y"}, "a", "b"]);
     * // Fails
     * expect(["b", "a", "a"]).toEqualUnordered(["a", "b"]);
     *
     * // Passes
     * expect({
     *   a: ["x", "y", "x"]
     * }).toEqual({
     *   a: expect.toEqualUnordered(["x", "x", "y"])
     * });
     * // Fails
     * expect({
     *   a: ["x", "y", "x"]
     * }).toEqual({
     *   a: expect.toEqualUnordered(["x", "y"])
     * });
     */
    toEqualUnordered(members: Array<any> | Set<any>): R;
  }
}

export default undefined;
