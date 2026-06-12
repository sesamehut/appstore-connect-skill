import { AscUpstreamError } from "../errors.js";

/**
 * Narrows openapi-fetch's `data | undefined` to the response document. The
 * auth middleware throws on every non-OK response, so `undefined` here means
 * the success-path contract drifted — surfaced as an upstream error.
 */
export function expectDocument<T>(data: T | undefined): T {
  if (data === undefined) {
    throw new AscUpstreamError(
      "ASC returned a success status without a response document.",
    );
  }
  return data;
}
