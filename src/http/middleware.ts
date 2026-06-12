import type { Middleware } from "openapi-fetch";

import type { AscKeyForm } from "../auth/credentials.js";
import type { AscTokenProvider } from "../auth/token.js";
import { AscAuthenticationError } from "../errors.js";
import { ascErrorFromResponse } from "./normalize.js";
import type { FetchLike } from "./transport.js";

export interface AscAuthMiddlewareOptions {
  readonly tokenProvider: AscTokenProvider;
  /** Drives the key-form hints in normalized error messages. */
  readonly keyForm: AscKeyForm;
  /**
   * Transport used for the 401 replay. It must uphold createRetryingFetch's
   * invariant of never consuming the requests it sends — client.ts pairs the
   * two so this holds by construction.
   */
  readonly fetch: FetchLike;
}

const BEARER_PREFIX = "Bearer ";

/**
 * The auth seam: injects the Bearer token on the way out and owns response
 * error semantics on the way back — every non-OK response leaves this
 * middleware as a thrown typed AscError, so callers never branch on raw
 * status codes.
 *
 * A 401 gets one controlled re-sign + replay. The replay calls the transport
 * directly rather than going back through the client, so it cannot re-enter
 * this middleware: replay-once is structural, not counted.
 */
export function createAscAuthMiddleware(
  options: AscAuthMiddlewareOptions,
): Middleware {
  const { tokenProvider, keyForm, fetch: transportFetch } = options;

  return {
    async onRequest({ request }) {
      // Token acquisition failures (credential problems, signer failures)
      // reject the call here, before anything reaches the network.
      const token = await tokenProvider.getToken();
      request.headers.set("authorization", `${BEARER_PREFIX}${token}`);
      return request;
    },

    async onResponse({ request, response }) {
      if (response.ok) {
        return undefined;
      }
      if (response.status !== 401) {
        throw await ascErrorFromResponse(response, { request, keyForm });
      }

      const authorization = request.headers.get("authorization") ?? "";
      const staleToken = authorization.startsWith(BEARER_PREFIX)
        ? authorization.slice(BEARER_PREFIX.length)
        : "";
      // Single-flighted by the stale token: a burst of concurrent 401s
      // produces exactly one re-sign, and a token that was already replaced
      // is returned as-is instead of being re-signed again.
      const freshToken = await tokenProvider.invalidate(staleToken);

      let replay: Request;
      try {
        replay = request.clone();
      } catch (cause) {
        // Only reachable if the transport invariant (input requests are
        // never consumed) was violated by a custom fetch; surface that as an
        // auth failure with context instead of an opaque TypeError.
        throw new AscAuthenticationError(
          "ASC rejected the token, and the request could not be cloned for a replay because its body was already consumed",
          {
            cause,
            request: { method: request.method, url: request.url, status: 401 },
          },
        );
      }
      replay.headers.set("authorization", `${BEARER_PREFIX}${freshToken}`);
      const replayResponse = await transportFetch(replay);
      if (replayResponse.ok) {
        // Returned (not thrown): openapi-fetch swaps it in as the response
        // the caller parses.
        return replayResponse;
      }

      const normalized = await ascErrorFromResponse(replayResponse, {
        request,
        keyForm,
      });
      if (replayResponse.status === 401) {
        throw new AscAuthenticationError(
          `Authentication failed again after one forced re-sign; not retrying further. ${normalized.message}`,
          {
            apiErrors: normalized.apiErrors,
            ...(normalized.rateLimit !== undefined && {
              rateLimit: normalized.rateLimit,
            }),
            ...(normalized.request !== undefined && {
              request: normalized.request,
            }),
          },
        );
      }
      throw normalized;
    },
  };
}
