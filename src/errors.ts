import type { components } from "./generated/asc-openapi.js";
import type { RateLimitSnapshot } from "./http/rate-limit.js";

/** One entry of an ASC JSON:API error response, exactly as the contract types it. */
export type AscApiErrorItem = NonNullable<
  components["schemas"]["ErrorResponse"]["errors"]
>[number];

/**
 * Semantic failure classification shared by every layer. M5/M6 extend this
 * union with a `file-processing` family (download/unpack/parse/upload stages)
 * without touching the existing categories.
 */
export type AscErrorCategory =
  | "credential"
  | "authentication"
  | "permission"
  | "not-found"
  | "invalid-parameter"
  | "rate-limit"
  | "upstream"
  | "network";

/** Non-sensitive request coordinates attached to errors for diagnostics. */
export interface AscRequestContext {
  readonly method: string;
  /** Origin + path + query. Never carries headers or credentials. */
  readonly url: string;
  readonly status?: number;
}

export interface AscErrorOptions {
  readonly apiErrors?: readonly AscApiErrorItem[];
  readonly rateLimit?: RateLimitSnapshot;
  readonly request?: AscRequestContext;
  readonly cause?: unknown;
}

/**
 * Base of all thrown failures. Normalization happens exactly once, at the
 * response boundary; upper layers branch on `instanceof` subclasses or the
 * `category` discriminant (for exhaustive switches and structured logging).
 */
export abstract class AscError extends Error {
  abstract readonly category: AscErrorCategory;
  /** Raw JSON:API `errors` array, verbatim. Empty when no body was available. */
  readonly apiErrors: readonly AscApiErrorItem[];
  readonly rateLimit?: RateLimitSnapshot;
  readonly request?: AscRequestContext;

  constructor(message: string, options: AscErrorOptions = {}) {
    super(
      message,
      options.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = new.target.name;
    this.apiErrors = options.apiErrors ?? [];
    if (options.rateLimit !== undefined) {
      this.rateLimit = options.rateLimit;
    }
    if (options.request !== undefined) {
      this.request = options.request;
    }
  }
}

export type CredentialErrorReason =
  | "missing-key-id"
  | "missing-private-key"
  | "conflicting-private-key-sources"
  | "unreadable-private-key-file"
  | "invalid-private-key";

/** Local configuration failure raised before any request is attempted. */
export class AscCredentialError extends AscError {
  readonly category = "credential";
  readonly reason: CredentialErrorReason;

  constructor(
    message: string,
    reason: CredentialErrorReason,
    options?: AscErrorOptions,
  ) {
    super(message, options);
    this.reason = reason;
  }
}

/** ASC rejected the signed token, even after the single controlled re-sign. */
export class AscAuthenticationError extends AscError {
  readonly category = "authentication";
}

/** 403: the key's role lacks access. Deliberately distinct from not-found. */
export class AscPermissionError extends AscError {
  readonly category = "permission";
}

export class AscNotFoundError extends AscError {
  readonly category = "not-found";
}

/** Request shape rejected by ASC; JSON:API `source` pointers locate the input. */
export class AscInvalidParameterError extends AscError {
  readonly category = "invalid-parameter";
}

/** 429 after the transport's retry budget. Carries the rate-limit snapshot. */
export class AscRateLimitError extends AscError {
  readonly category = "rate-limit";
}

/** 5xx or an unrecognized status: ASC-side failure, response context kept. */
export class AscUpstreamError extends AscError {
  readonly category = "upstream";
}

/** Transport-level failure with no HTTP response, after capped retries. */
export class AscNetworkError extends AscError {
  readonly category = "network";
  /** Total attempts made, including the first. */
  readonly attempts: number;

  constructor(message: string, attempts: number, options?: AscErrorOptions) {
    super(message, options);
    this.attempts = attempts;
  }
}
