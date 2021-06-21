import { isDeepStrictEqual } from "util";

// These declarations aren't directly attached to our code, so ESLint sees
// everything here as unused.
/* eslint-disable no-unused-vars */
declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveMembers(members: Array<any> | Set<any>): R;
    }

    // Jest doesn't document this, and looking at the types, it *seems* like
    // the above declaration should effectively do this, but in practice it
    // does not, and we need to define it explicitly.
    interface Expect {
      toHaveMembers(members: Array<any> | Set<any>): any;
    }
  }
}
/* eslint-enable */

expect.extend({
  /**
   * Expect an iterable to have exactly the same items as an expected list.
   * Items can occur in any order, but must occur the same number of times as
   * the expected values.
   *
   * @example
   * expect(["b", {x: "y"}, "a"]).tohaveMembers([{x: "y"}, "a", "b"]);
   *
   * expect({
   *   a: ["x", "y", "x"]
   * }).toEqual({
   *   a: expect.toHaveMembers(["x", "x", "y"])
   * });
   */
  toHaveMembers(received: any, members: Array<any> | Set<any>): jest.CustomMatcherResult {
    if (!received?.[Symbol.iterator]) throw new Error(`Received value (${received}) was not iterable`);
    if (!members?.[Symbol.iterator]) throw new Error(`Expected value (${members}) was not iterable`);

    // `this.equals` is only available when a matcher is used in a
    // non-asymmetric context (that is, `expect(x).toHaveMembers(y)`, but not
    // `expect.toHaveMembers(y)`). So we implement our own comparison.
    // This is, we can't do:
    //   let pass = this.equals(receivedItems, expectedItems);
    //
    // Sadly, this also means we can't have nested asymmetic matchers. :(
    // See: https://github.com/facebook/jest/issues/8295
    const receivedItems = [...received].sort();
    const expectedItems = [...members].sort();
    const pass = isDeepStrictEqual(receivedItems, expectedItems);

    return {
      pass,
      message() {
        const not = pass ? '' : "not ";
        return `expected ${received} ${not}to have members ${members}`;
      }
    }
  },
});

export default undefined;
