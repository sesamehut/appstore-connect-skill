// Public surface of the M2 request core. Higher layers (pagination,
// workflows, the Skill CLI) build on these exports; the generated contract
// types are re-exported so consumers never import from src/generated/
// directly.

export { ASC_ENV_VARS, loadAscCredentialsFromEnv } from "./auth/credentials.js";
export type {
  AscCredentials,
  AscKeyForm,
  IndividualKeyCredentials,
  TeamKeyCredentials,
} from "./auth/credentials.js";

export {
  ASC_TOKEN_AUDIENCE,
  AscTokenProvider,
  IAT_BACKDATE_SECONDS,
  REFRESH_SAFETY_MARGIN_SECONDS,
  signAscToken,
  TOKEN_LIFETIME_SECONDS,
} from "./auth/token.js";
export type {
  SignedToken,
  SignFunction,
  TokenProviderOptions,
} from "./auth/token.js";

export {
  AscAuthenticationError,
  AscCredentialError,
  AscError,
  AscInvalidParameterError,
  AscNetworkError,
  AscNotFoundError,
  AscPermissionError,
  AscRateLimitError,
  AscUpstreamError,
} from "./errors.js";
export type {
  AscApiErrorItem,
  AscErrorCategory,
  AscErrorOptions,
  AscRequestContext,
  CredentialErrorReason,
} from "./errors.js";

export { ASC_API_BASE_URL, createAscClient } from "./http/client.js";
export type { AscClient, AscClientConfig } from "./http/client.js";

export { parseRateLimitHeader } from "./http/rate-limit.js";
export type {
  RateLimitObserver,
  RateLimitObserverContext,
  RateLimitSnapshot,
} from "./http/rate-limit.js";

export { createRetryingFetch } from "./http/transport.js";
export type {
  FetchLike,
  RetryOptions,
  TransportOptions,
} from "./http/transport.js";

export type { components, operations, paths } from "./generated/asc-openapi.js";
