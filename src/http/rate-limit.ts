/**
 * ASC reports per-key quota via the `X-Rate-Limit` response header, e.g.
 * `user-hour-lim:3500;user-hour-rem:500;`. The snapshot is parsed on every
 * response and handed to an observer so upper layers (pagination, workflows)
 * can pace long-running tasks; it is never merged into success payloads.
 */
export interface RateLimitSnapshot {
  /** Hourly request quota for the key (`user-hour-lim`). */
  readonly hourlyLimit?: number;
  /** Requests left in the current rolling window (`user-hour-rem`). */
  readonly remaining?: number;
  /** Verbatim header value, kept for diagnostics and forward compatibility. */
  readonly raw: string;
}

export interface RateLimitObserverContext {
  readonly method: string;
  /** Origin + path + query. Never carries headers or credentials. */
  readonly url: string;
  readonly status: number;
}

/** Invoked once per HTTP response, including retry attempts and 401 replays. */
export type RateLimitObserver = (
  snapshot: RateLimitSnapshot,
  context: RateLimitObserverContext,
) => void;

/**
 * Returns `undefined` when the header is absent or blank. Unknown segments
 * and malformed numbers are skipped rather than rejected: the header is
 * informational, and Apple may extend it without notice.
 */
export function parseRateLimitHeader(
  headerValue: string | null,
): RateLimitSnapshot | undefined {
  if (headerValue === null || headerValue.trim() === "") {
    return undefined;
  }

  let hourlyLimit: number | undefined;
  let remaining: number | undefined;
  for (const segment of headerValue.split(";")) {
    const separator = segment.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const name = segment.slice(0, separator).trim();
    const value = Number.parseInt(segment.slice(separator + 1).trim(), 10);
    if (Number.isNaN(value)) {
      continue;
    }
    if (name === "user-hour-lim") {
      hourlyLimit = value;
    } else if (name === "user-hour-rem") {
      remaining = value;
    }
  }

  return Object.freeze({
    raw: headerValue,
    ...(hourlyLimit !== undefined && { hourlyLimit }),
    ...(remaining !== undefined && { remaining }),
  });
}
