// TODO: this is a copy of `expectDatetimeString` in loader/test/support/index`;
// the implementatoins should be shared.

import { expect } from "@jest/globals";

/**
 * Declare that a value should be a complete W3C-style ISO 8601 datetime
 * string. (e.g. "2021-03-13T05:53:20.123Z")
 *
 * @example
 * const value = { time: "2021-03-13T05:53:20.123Z" };
 * expect(value).toEqual({ time: expectDatetimeString() })
 */
export function expectDatetimeString(): any {
  return expect.stringMatching(
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(.\d+)?(Z|[+-]\d\d:?\d\d)$/
  );
}

/**
 * Wait for all promises to settle, then reject afterward if at least one
 * of them rejected.
 *
 * This is similar to `Promise.all`, but it does not reject immediately. It is
 * also like `Promise.allSettled`, but that function never rejects.
 */
export async function allResolved(promises: Promise<void>[]): Promise<void> {
  const results = await Promise.allSettled(promises);
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
  }
}
