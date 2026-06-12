import { setTimeout as delay } from "node:timers/promises";

import { AscNetworkError } from "../errors.js";
import { parseRateLimitHeader } from "./rate-limit.js";
import type { RateLimitObserver } from "./rate-limit.js";

export type FetchLike = (request: Request) => Promise<Response>;

export const DEFAULT_MAX_ATTEMPTS = 4;
export const DEFAULT_BASE_DELAY_MS = 250;
export const DEFAULT_MAX_DELAY_MS = 4000;

/**
 * Only the budget is configurable; the policy is fixed. What retries (429,
 * 5xx, network failures — never other 4xx, never aborts) and how (full-jitter
 * exponential backoff, no Retry-After: ASC does not send it) are semantics
 * the rest of the stack relies on, so they are not a tuning surface.
 */
export interface RetryOptions {
  /** Total attempts including the first. */
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  /** Test seam. The default sleep is abortable via the request's signal. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Test seam for deterministic jitter. */
  readonly random?: () => number;
}

export interface TransportOptions {
  readonly retry?: RetryOptions;
  readonly onRateLimit?: RateLimitObserver;
  /** Base fetch under the retry layer. */
  readonly fetch?: FetchLike;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  await delay(ms, undefined, signal === undefined ? undefined : { signal });
}

/**
 * Wraps fetch with transport-level resilience, fit for openapi-fetch's
 * `fetch` option. Auth and error semantics live in the middleware layer;
 * neither layer knows the other's internals.
 *
 * Invariant: the input Request is never consumed — every attempt sends a
 * clone. The auth middleware relies on this to clone the request once more
 * for its 401 replay.
 */
export function createRetryingFetch(options: TransportOptions = {}): FetchLike {
  const baseFetch =
    options.fetch ?? ((request: Request) => globalThis.fetch(request));
  const maxAttempts = options.retry?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.retry?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.retry?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const sleep = options.retry?.sleep ?? defaultSleep;
  const random = options.retry?.random ?? Math.random;
  const onRateLimit = options.onRateLimit;

  // AWS-style full jitter: spreads concurrent retries across the whole
  // window instead of synchronizing them into bursts.
  const backoffDelayMs = (attempt: number): number =>
    random() * Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));

  const notifyRateLimit = (request: Request, response: Response): void => {
    if (onRateLimit === undefined) {
      return;
    }
    const snapshot = parseRateLimitHeader(response.headers.get("x-rate-limit"));
    if (snapshot === undefined) {
      return;
    }
    try {
      onRateLimit(snapshot, {
        method: request.method,
        url: request.url,
        status: response.status,
      });
    } catch {
      // An observer bug must never fail (or retry) the request it watched.
    }
  };

  return async (request: Request): Promise<Response> => {
    for (let attempt = 1; ; attempt += 1) {
      request.signal.throwIfAborted();
      let response: Response;
      try {
        // Cloning tees streamed bodies, which is fine for the JSON-sized
        // payloads this client carries; the M6 media upload flow bypasses
        // this client entirely (pre-signed URLs, no auth).
        response = await baseFetch(request.clone());
      } catch (error) {
        // Aborts propagate verbatim: the caller cancelled, nothing failed.
        if (isAbortError(error)) {
          throw error;
        }
        if (attempt >= maxAttempts) {
          throw new AscNetworkError(
            `${request.method} ${request.url} failed at the network level after ${String(attempt)} attempt(s)`,
            attempt,
            {
              cause: error,
              request: { method: request.method, url: request.url },
            },
          );
        }
        await sleep(backoffDelayMs(attempt), request.signal);
        continue;
      }

      notifyRateLimit(request, response);

      if (
        (response.status === 429 || response.status >= 500) &&
        attempt < maxAttempts
      ) {
        await sleep(backoffDelayMs(attempt), request.signal);
        continue;
      }
      // Success, a non-retryable 4xx, or an exhausted retry budget: returned
      // as-is, never thrown — semantic classification is the middleware's
      // job, and normalization must happen exactly once.
      return response;
    }
  };
}
