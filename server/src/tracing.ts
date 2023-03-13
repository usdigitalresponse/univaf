/**
 * Tools for instrumenting code with traces. This is mainly designed to support
 * Sentry's tracing features, but could be expanded support other approaches,
 * like OpenTelemetry.
 */

import * as Sentry from "@sentry/node";
import type { Span } from "@sentry/tracing";
import type { SpanContext } from "@sentry/types";
export type { Span } from "@sentry/tracing";

interface SpanOptions extends SpanContext {
  parentSpan?: Span;
}

/**
 * Start a tracing span. The returned span should be explicitly ended with
 * `finishSpan`. The created span will be a child of whatever span is currently
 * active (and then become the current span itself), or if there is no current
 * span or transaction, this will start one for you.
 *
 * Alternatively, can explicitly pass an actual span object to be the parent:
 * `startSpan({ parentSpan: yourSpan })`. In this case, the new span won't
 * automatically become the global "current" span.
 */
export function startSpan(options: SpanOptions): Span {
  let { parentSpan, ...spanOptions } = options;

  let scope;
  if (!parentSpan) {
    scope = Sentry.getCurrentHub().getScope();
    parentSpan = scope.getSpan();
  }

  let newSpan: Span;
  if (parentSpan) {
    newSpan = parentSpan.startChild(spanOptions);
  } else {
    newSpan = Sentry.startTransaction(spanOptions as any);
  }

  // If we retrieved the span from the scope, update the scope.
  if (scope) {
    scope.setSpan(newSpan);
  }

  return newSpan;
}

/**
 * Finish a tracing span. This will also replace the global "current" span with
 * this span's parent (if it has a parent).
 */
export function finishSpan(span: Span, timestamp?: number): void {
  span.finish(timestamp);

  let parent;
  if (span.parentSpanId) {
    parent = span.spanRecorder?.spans?.find(
      (s) => s.spanId === span.parentSpanId
    );
  }

  const scope = Sentry.getCurrentHub().getScope();
  if (scope.getSpan() === span) {
    scope.setSpan(parent);
  }
}

/**
 * Create a new span, run the provided function inside of it, and finish the
 * span afterward. The function can be async, in which case this will return an
 * awaitable promise.
 *
 * The provided function can take the span as the first argument, in case it
 * needs to modify the span in some way. If the function returns a value,
 * `withSpan` will return that value as well.
 *
 * @example
 * withSpan({ op: "validateData" }, (span) => {
 *   doSomeDataValidation();
 * });
 *
 * let data = { some: "data" };
 * const id = await withSpan({ op: "saveData" }, async (span) => {
 *   const id = await saveData(data);
 *   await updateSomeRelatedRecord(id, otherData);
 *   return id;
 * });
 */
export function withSpan<T extends (span?: Span) => any>(
  options: SpanOptions,
  callback: T
): ReturnType<T> {
  const span = startSpan(options);

  let callbackResult;
  try {
    callbackResult = callback(span);
  } catch (error) {
    finishSpan(span);
    throw error;
  }

  if ("then" in callbackResult && "finally" in callbackResult) {
    return callbackResult.finally(() => finishSpan(span));
  } else {
    finishSpan(span);
    return callbackResult;
  }
}

/**
 * Wrap a function so that it is always called with a span (named the same as
 * the function). Keeps typings of the original function intact.
 *
 * @example
 * function privateDoSomeStuff(arg1, arg2) { ... }
 * export const doSomeStuff = wrapWithSpan(privateDoSomeStuff);
 */
export function wrapWithSpan<T extends (...x: any) => any>(callable: T): T {
  const options = { op: callable.name };
  // @ts-expect-error Cannot figure out how to type this correctly. :(
  return (...args: any) => withSpan<T>(options, () => callable(...args));
}

/**
 * Shortcut for `withSpan` if you are only wrapping a single function. Uses the
 * function's name as the span's name.
 *
 * @example
 * // This shortcut:
 * callWithSpan(someFunction, arg1, arg)
 * // Is equivalent to:
 * withSpan({ op: "someFunction" }, () => someFunction(arg1, arg2))
 */
export function callWithSpan<T extends (...x: any) => any>(
  callable: T,
  ...args: Parameters<T>
): ReturnType<T> {
  // @ts-expect-error Cannot figure out how to type this correctly. :(
  return withSpan({ op: callable.name }, () => callable(...args));
}
