/**
 * Tools for instrumenting code with traces. This is mainly designed to support
 * Sentry's tracing features, but could be expanded support other approaches,
 * like OpenTelemetry.
 */

import * as Sentry from "@sentry/node";
import type { Span, SpanStatusType } from "@sentry/tracing";
import type { SpanContext } from "@sentry/types";
export type { Span } from "@sentry/tracing";

interface SpanOptions extends SpanContext {
  parentSpan?: Span;
  timeout?: number;
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
 *
 * Spans created this way will be automatically canceled when their transaction
 * finishes (Sentry will drop any unfinished spans). Alternatively, you can
 * set `timeout` to a number of milliseconds, and the span will be canceled
 * after that time (this should prevent you from accidentally leaving a span
 * open forever). Canceled spans have a non-ok status set and a `cancel` tag
 * with a reason.
 *
 * More on why spans need canceling:
 * https://github.com/getsentry/sentry-javascript/issues/4165#issuecomment-971424754
 */
export function startSpan(options: SpanOptions): Span {
  let { parentSpan, timeout, ...spanOptions } = options;

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

  if (timeout) {
    setTimeout(() => {
      cancelSpan(newSpan, "deadline_exceeded");
    }, timeout).unref();
  } else if (newSpan.transaction && newSpan.transaction !== newSpan) {
    // FIXME: newer Sentry has an event for this: "finishTransaction" emitted
    // on the hub's client:
    // - Code: https://github.com/getsentry/sentry-javascript/blob/ba99e7cdf725725e5a1b99e9d814353dbb3ae2b6/packages/core/src/tracing/transaction.ts#L144-L147
    // - Feature: https://github.com/getsentry/sentry-javascript/issues/7262
    const _finishTransaction = newSpan.transaction.finish;
    newSpan.transaction.finish = function finish(...args) {
      cancelSpan(newSpan, "cancelled", "did_not_finish");
      return _finishTransaction.call(this, ...args);
    };
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
    // FIXME: abstract this with a nice name, even though it's simple.
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
 * If a span is not finished, finish it and set its status and tags to indicate
 * that it was canceled. If the span is already finished, do nothing.
 */
function cancelSpan(
  span: Span,
  status: SpanStatusType = "cancelled",
  tag: string = status
): void {
  if (!span.endTimestamp) {
    span.setStatus(status);
    span.setTag("cancel", tag);
    finishSpan(span);
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
