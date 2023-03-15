/**
 * Tools for instrumenting code with traces. This is mainly designed to support
 * Sentry's tracing features, which don't always work as you'd expect. It could
 * also be expanded support other approaches, like OpenTelemetry.
 *
 * A brief overview of the Sentry tracing model:
 *
 * Sentry can keep track of Transactions, which are the root of a tree of Spans
 * (worth noting: Transactions *are* Spans). Spans are arbitrary sections of
 * code you are tracking the performance of, and are sort of like function calls
 * in a traditional performance profile.
 *
 * By default, Sentry keeps track of the "current" Span on each Hub (Hubs keep
 * track of all the stateful stuff in Sentry like scopes and clients -- e.g. if
 * you call `Sentry.captureException`, for example, that just gets forwarded to
 * the current Hub for handling. To keep concurrent async things in their own
 * lane, Sentry may create a different Hub for each async domain [for more on
 * domains, check out the Node.js docs]). The Hub's current Span is really just
 * a shortcut to make it easier to arbitrarily start a new span when you don't
 * have a handle on its parent (so you don't have to pass context info around
 * everywhere). You can have multiple Spans from the same Transaction or even
 * multiple Transactions in parallel on the same Hub, but at that point you are
 * on your own in terms of keeping track of the right parent spans for any new
 * children; Sentry doesn't have a way to fork a Hub or async domain.
 * (Side note: async domains are deprecated in Node; hopefully someday Sentry
 * will upgrade to a newer approach and add better async management in general.)
 *
 * When it comes to HTTP servers (e.g. Express), Sentry's
 * `Handlers.requestHandler` middleware creates a new domain and Hub for each
 * request and `Handlers.requestHandler` middleware creates a new Transaction
 * for each request. The Tracing Express *integration* (not the middleware)
 * adds spans for each middleware in your app/routers (which is why you have to
 * make sure the tracing middleware is one of the first middlewares, so it has
 * created a transaction for the integration to use [it's not obvious why the
 * Express integration doesn't just insert the tracing middleware at the bottom
 * of the middleware stack for you ¯\_(ツ)_/¯]).
 */

import EventEmitter from "node:events";
import * as Sentry from "@sentry/node";
import { Transaction } from "@sentry/tracing";
import type { Span, SpanStatusType } from "@sentry/tracing";
import type { SpanContext } from "@sentry/types";
export type { Span } from "@sentry/tracing";

interface SpanOptions extends SpanContext {
  parentSpan?: Span;
  timeout?: number;
}

// Monkey-patch Transaction to add an event to notify listeners (in our case,
// child spans) when the transaction is finishing. This is super hacky.
//
// The most recent release of the Sentry SDK has a `finishTransaction` event
// on the hub's client, but there are a lot of guard clauses anywhere the client
// gets used internally, and I'm not sure how reliable it is for this use case.
// We want to wrap up before the transaction finishes, not when a client that
// may-or-may-not exist depending on configuration is finishing a transaction.
// (Also, the transaction's `_hub` is a nullable private property, so it would
// still be hacky to grab it and add a listener anyway.)
interface PatchedTransaction extends Transaction {
  onFinish(listener: (...args: any[]) => void): void;
  _emitter?: EventEmitter;
}

const _transactionFinish = Transaction.prototype.finish;
Transaction.prototype.finish = function finish(
  this: PatchedTransaction,
  endTimestamp?: number
) {
  this._emitter?.emit("finish", this);
  return _transactionFinish.call(this, endTimestamp);
};

// @ts-expect-error: onFinish doesn't exist; we're adding it.
Transaction.prototype.onFinish = function onFinish(
  this: PatchedTransaction,
  listener: (...args: any[]) => void
) {
  if (!this._emitter) this._emitter = new EventEmitter();
  this._emitter.once("finish", listener);
};

function getParentSpan(span: Span) {
  if (span.parentSpanId) {
    return span.spanRecorder?.spans?.find(
      (s) => s.spanId === span.parentSpanId
    );
  }
  return null;
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
  } else if (newSpan.transaction !== newSpan) {
    (newSpan.transaction as PatchedTransaction)?.onFinish(() =>
      cancelSpan(newSpan, "cancelled", "did_not_finish")
    );
  }

  return newSpan;
}

/**
 * Finish a tracing span. This will also replace the global "current" span with
 * this span's parent (if it has a parent).
 */
export function finishSpan(span: Span, timestamp?: number): void {
  if (span.endTimestamp) return;

  span.finish(timestamp);

  const scope = Sentry.getCurrentHub().getScope();
  if (scope.getSpan() === span) {
    const parent = getParentSpan(span);
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
  tag: any = status
): void {
  if (span.endTimestamp) return;

  if (typeof tag !== "string") {
    tag = `error:${tag?.code || tag?.constructor?.name || "?"}`;
  }

  span.setStatus(status);
  span.setTag("cancel", tag);
  finishSpan(span);
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
  options: SpanOptions | string,
  callback: T
): ReturnType<T> {
  if (typeof options === "string") options = { op: options };
  const span = startSpan(options);

  let callbackResult;
  try {
    callbackResult = callback(span);
  } catch (error) {
    cancelSpan(span, "unknown_error", error);
    throw error;
  }

  if ("then" in callbackResult) {
    return callbackResult.then(
      (result: any) => {
        finishSpan(span);
        return result;
      },
      (error: any) => {
        cancelSpan(span, "internal_error", error);
        throw error;
      }
    );
  } else {
    finishSpan(span);
    return callbackResult;
  }
}
