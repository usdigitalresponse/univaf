import { isDeepStrictEqual } from "node:util";

// These declarations aren't directly attached to our code, so ESLint sees
// everything here as unused.
/* eslint-disable no-unused-vars */
// We have to follow the types Jest outputs, so namespace is not our choice.
/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace jest {
    interface Matchers<R> {
      toEqualUnordered(members: Array<any> | Set<any>): R;
    }

    // Jest doesn't document this, and looking at the types, it *seems* like
    // the above declaration should effectively do this, but in practice it
    // does not, and we need to define it explicitly.
    interface Expect {
      toEqualUnordered(members: Array<any> | Set<any>): any;
    }
  }
}
/* eslint-enable */
/* eslint-enable */

expect.extend({
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
  toEqualUnordered(
    received: any,
    expected: Array<any> | Set<any>
  ): jest.CustomMatcherResult {
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
  },
});

export default undefined;
