// Public surface of the runtime layers delivered so far (auth + request
// core, pagination, first capabilities). Higher layers (workflows, the Skill
// CLI) build on these exports; the generated contract types are re-exported
// so consumers never import from src/generated/ directly.

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
  AscRateLimitFloorError,
  AscUpstreamError,
} from "./errors.js";
export type {
  AscApiErrorItem,
  AscErrorCategory,
  AscErrorOptions,
  AscPaginationProgress,
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

export {
  DEFAULT_RATE_LIMIT_FLOOR,
  paginate,
  readPaged,
} from "./pagination/paginate.js";
export type {
  AscPageResult,
  CollectedRead,
  PaginateOptions,
  ReadScope,
} from "./pagination/paginate.js";
export type {
  AscPagedDocument,
  PagedGetPath,
  PageItemOf,
  PageOf,
} from "./pagination/paged-types.js";

export { getApp, listApps } from "./capabilities/apps.js";
export type {
  App,
  AppResponse,
  GetAppOptions,
  ListAppsOptions,
} from "./capabilities/apps.js";
export { listAppStoreVersions } from "./capabilities/app-store-versions.js";
export type {
  AppStoreVersion,
  ListAppStoreVersionsOptions,
} from "./capabilities/app-store-versions.js";

export type { components, operations, paths } from "./generated/asc-openapi.js";
