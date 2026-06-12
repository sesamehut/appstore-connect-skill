import createClient from "openapi-fetch";
import type { Client } from "openapi-fetch";

import type { AscCredentials } from "../auth/credentials.js";
import { AscTokenProvider } from "../auth/token.js";
import type { paths } from "../generated/asc-openapi.js";
import { createAscAuthMiddleware } from "./middleware.js";
import type { RateLimitObserver } from "./rate-limit.js";
import { createRetryingFetch } from "./transport.js";
import type { FetchLike, RetryOptions } from "./transport.js";

export const ASC_API_BASE_URL = "https://api.appstoreconnect.apple.com";

export interface AscClientConfig {
  readonly credentials: AscCredentials;
  /** Override for tests and proxies. */
  readonly baseUrl?: string;
  readonly retry?: RetryOptions;
  /** Receives a quota snapshot for every response carrying `X-Rate-Limit`. */
  readonly onRateLimit?: RateLimitObserver;
  /** Base fetch under the retrying transport. */
  readonly fetch?: FetchLike;
  /** Test seam (signing counters); defaults to a provider over `credentials`. */
  readonly tokenProvider?: AscTokenProvider;
}

/**
 * The typed ASC client: every call site infers parameter and response shapes
 * from the generated contract. Failures surface as thrown AscError subclasses
 * (the `error` branch of openapi-fetch results is never populated).
 */
export type AscClient = Client<paths>;

/**
 * The composition point of the request core: credentials → token provider →
 * auth middleware, with retries and rate-limit observation in a transport
 * layer beneath. Higher layers (pagination in M3, workflows in M5/M6)
 * consume the returned client and never re-wire these pieces.
 */
export function createAscClient(config: AscClientConfig): AscClient {
  const tokenProvider =
    config.tokenProvider ?? new AscTokenProvider(config.credentials);
  const transport = createRetryingFetch({
    ...(config.retry !== undefined && { retry: config.retry }),
    ...(config.onRateLimit !== undefined && {
      onRateLimit: config.onRateLimit,
    }),
    ...(config.fetch !== undefined && { fetch: config.fetch }),
  });

  const client = createClient<paths>({
    baseUrl: config.baseUrl ?? ASC_API_BASE_URL,
    fetch: transport,
    // ASC's JSON:API list params (fields, filter, ...) are comma-joined per
    // Apple's spec; openapi-fetch's exploded default would emit repeated
    // parameter names instead.
    querySerializer: { array: { style: "form", explode: false } },
  });
  client.use(
    createAscAuthMiddleware({
      tokenProvider,
      keyForm: config.credentials.keyForm,
      fetch: transport,
    }),
  );
  return client;
}
