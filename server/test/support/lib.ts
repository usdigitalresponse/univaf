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
