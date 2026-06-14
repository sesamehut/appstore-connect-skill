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
  AscFileProcessingError,
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
  FileProcessingStage,
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

export { getAppInfo, listAppInfos } from "./capabilities/app-infos.js";
export type {
  AppInfo,
  AppInfoResponse,
  GetAppInfoOptions,
  ListAppInfosOptions,
} from "./capabilities/app-infos.js";

export {
  createAppInfoLocalization,
  getAppInfoLocalization,
  listAppInfoLocalizations,
  updateAppInfoLocalization,
} from "./capabilities/app-info-localizations.js";
export type {
  AppInfoLocalization,
  AppInfoLocalizationCreateAttributes,
  AppInfoLocalizationResponse,
  AppInfoLocalizationUpdateAttributes,
  GetAppInfoLocalizationOptions,
  ListAppInfoLocalizationsOptions,
} from "./capabilities/app-info-localizations.js";

export {
  createAppStoreVersionLocalization,
  getAppStoreVersionLocalization,
  listAppStoreVersionLocalizations,
  updateAppStoreVersionLocalization,
} from "./capabilities/app-store-version-localizations.js";
export type {
  AppStoreVersionLocalization,
  AppStoreVersionLocalizationCreateAttributes,
  AppStoreVersionLocalizationResponse,
  AppStoreVersionLocalizationUpdateAttributes,
  GetAppStoreVersionLocalizationOptions,
  ListAppStoreVersionLocalizationsOptions,
} from "./capabilities/app-store-version-localizations.js";

export {
  getCustomerReview,
  getCustomerReviewResponse,
  listCustomerReviewsForApp,
  listCustomerReviewsForVersion,
  setCustomerReviewResponse,
} from "./capabilities/customer-reviews.js";
export type {
  CustomerReview,
  CustomerReviewResponse,
  CustomerReviewResponseV1,
  CustomerReviewResponseV1Response,
  GetCustomerReviewOptions,
  GetCustomerReviewResponseOptions,
  ListCustomerReviewsOptions,
} from "./capabilities/customer-reviews.js";

export {
  createAnalyticsReportRequest,
  deleteAnalyticsReportRequest,
  getAnalyticsReportRequest,
  listAnalyticsReportInstances,
  listAnalyticsReportRequests,
  listAnalyticsReports,
  listAnalyticsReportSegments,
} from "./capabilities/analytics-reports.js";
export type {
  AnalyticsReport,
  AnalyticsReportAccessType,
  AnalyticsReportCategory,
  AnalyticsReportGranularity,
  AnalyticsReportInstance,
  AnalyticsReportRequest,
  AnalyticsReportRequestResponse,
  AnalyticsReportSegment,
  GetAnalyticsReportRequestOptions,
  ListAnalyticsReportInstancesOptions,
  ListAnalyticsReportRequestsOptions,
  ListAnalyticsReportsOptions,
  ListAnalyticsReportSegmentsOptions,
} from "./capabilities/analytics-reports.js";

export {
  downloadAnalyticsInstance,
  downloadAnalyticsReport,
  ensureAnalyticsReportRequest,
} from "./workflows/analytics-reports.js";
export type {
  AnalyticsInstanceDownload,
  AnalyticsReportDownload,
  AnalyticsReportSelector,
  DownloadedAnalyticsSegment,
  EnsureAnalyticsReportRequestResult,
} from "./workflows/analytics-reports.js";

export {
  analyticsSegmentFileName,
  convertDelimitedReportToJson,
  defaultAnalyticsReportDirName,
  defaultFinanceReportFileName,
  defaultSalesReportFileName,
  downloadExternalFile,
  isGzipMagic,
  jsonSiblingPath,
  saveReportStream,
} from "./workflows/report-files.js";
export type {
  ConvertedJsonReport,
  DownloadExternalFileOptions,
  ReportDelimiter,
  SavedReportFile,
  SaveReportStreamOptions,
} from "./workflows/report-files.js";

export { downloadSalesReport } from "./workflows/sales-reports.js";
export type {
  SalesReportFrequency,
  SalesReportSpec,
  SalesReportSubType,
  SalesReportType,
} from "./workflows/sales-reports.js";

export { downloadFinanceReport } from "./workflows/finance-reports.js";
export type {
  FinanceReportSpec,
  FinanceReportType,
} from "./workflows/finance-reports.js";

export {
  commitAppScreenshot,
  createAppScreenshotSet,
  deleteAppScreenshot,
  deleteAppScreenshotSet,
  getAppScreenshot,
  listAppScreenshots,
  listAppScreenshotSets,
  reorderAppScreenshots,
  reserveAppScreenshot,
} from "./capabilities/app-screenshots.js";
export type {
  AppScreenshot,
  AppScreenshotCreateAttributes,
  AppScreenshotResponse,
  AppScreenshotSet,
  AppScreenshotSetResponse,
  AppScreenshotUpdateAttributes,
  ListAppScreenshotSetsOptions,
  ListAppScreenshotsOptions,
  ScreenshotDisplayType,
} from "./capabilities/app-screenshots.js";

export {
  commitAppPreview,
  createAppPreviewSet,
  deleteAppPreview,
  deleteAppPreviewSet,
  getAppPreview,
  listAppPreviews,
  listAppPreviewSets,
  reorderAppPreviews,
  reserveAppPreview,
} from "./capabilities/app-previews.js";
export type {
  AppPreview,
  AppPreviewCreateAttributes,
  AppPreviewResponse,
  AppPreviewSet,
  AppPreviewSetResponse,
  AppPreviewUpdateAttributes,
  ListAppPreviewSetsOptions,
  ListAppPreviewsOptions,
  PreviewType,
} from "./capabilities/app-previews.js";

export {
  computeFileMd5,
  readUploadFileMetadata,
  uploadFileParts,
} from "./workflows/media-files.js";
export type {
  MediaTransferResult,
  UploadFileMetadata,
  UploadFilePartsOptions,
  UploadPartOperation,
} from "./workflows/media-files.js";

export {
  ensurePreviewSet,
  ensureScreenshotSet,
  getPreviewStatus,
  getScreenshotStatus,
  inferPreviewMimeType,
  resolveLocalization,
  uploadPreview,
  uploadPreviewSet,
  uploadScreenshot,
  uploadScreenshotSet,
} from "./workflows/media-assets.js";
export type {
  EnsurePreviewSetResult,
  EnsureScreenshotSetResult,
  MediaAssetStatusResult,
  MediaPollOptions,
  MediaUploadOptions,
  MediaUploadResult,
  MediaUploadSetResult,
  ResolvedLocalization,
  UploadPreviewOptions,
  UploadPreviewSetOptions,
  UploadScreenshotSetOptions,
} from "./workflows/media-assets.js";

export {
  addTestersToGroup,
  checkRecruitmentCompatibleBuild,
  clearRecruitmentCriteria,
  createBetaGroup,
  deleteBetaGroup,
  getBetaGroup,
  listBetaGroups,
  listGroupBuilds,
  listGroupTesters,
  listRecruitmentCriterionOptions,
  readRecruitmentCriteria,
  removeTestersFromGroup,
  setPublicLink,
  setRecruitmentCriteria,
  updateBetaGroup,
} from "./capabilities/beta-groups.js";
export type {
  BetaGroup,
  BetaGroupCreateAttributes,
  BetaGroupResponse,
  BetaGroupUpdateAttributes,
  BetaRecruitmentCriterion,
  BetaRecruitmentCriterionCompatibleBuildCheckResponse,
  BetaRecruitmentCriterionOption,
  BetaRecruitmentCriterionResponse,
  DeviceFamily,
  DeviceFamilyOsVersionFilter,
  GetBetaGroupOptions,
  ListBetaGroupsOptions,
  ListGroupBuildsOptions,
  ListGroupTestersOptions,
  ListRecruitmentCriterionOptionsOptions,
  ReadRecruitmentCriteriaOptions,
} from "./capabilities/beta-groups.js";

export {
  createBetaTester,
  deleteBetaTester,
  getBetaTester,
  listBetaTesters,
  removeTesterFromApp,
} from "./capabilities/beta-testers.js";
export type {
  BetaInviteType,
  BetaTesterCreateAttributes,
  BetaTesterResponse,
  GetBetaTesterOptions,
  ListBetaTestersOptions,
} from "./capabilities/beta-testers.js";

export {
  addIndividualTesters,
  assignBuildToBetaGroups,
  expireBuild,
  findLatestProcessedBuild,
  getBuild,
  getBuildBetaDetail,
  listBuildIndividualTesters,
  listBuilds,
  listPreReleaseVersionBuilds,
  listPreReleaseVersions,
  getPreReleaseVersion,
  removeBuildFromBetaGroups,
  removeIndividualTesters,
  updateBuildBetaDetail,
} from "./capabilities/builds.js";
export type {
  Build,
  BuildAudienceType,
  BuildBetaDetail,
  BuildBetaDetailResponse,
  BuildBetaDetailUpdateAttributes,
  BuildPlatform,
  BuildProcessingState,
  BuildResponse,
  FindLatestProcessedBuildOptions,
  GetBuildOptions,
  ListBuildIndividualTestersOptions,
  ListBuildsOptions,
  ListPreReleaseVersionBuildsOptions,
  ListPreReleaseVersionsOptions,
  PrereleaseVersion,
  PrereleaseVersionResponse,
} from "./capabilities/builds.js";

export {
  createBetaAppLocalization,
  createBetaBuildLocalization,
  deleteBetaAppLocalization,
  deleteBetaBuildLocalization,
  listBetaAppLocalizations,
  listBetaBuildLocalizations,
  updateBetaAppLocalization,
  updateBetaBuildLocalization,
} from "./capabilities/beta-localizations.js";
export type {
  BetaAppLocalization,
  BetaAppLocalizationCreateAttributes,
  BetaAppLocalizationResponse,
  BetaAppLocalizationUpdateAttributes,
  BetaBuildLocalization,
  BetaBuildLocalizationCreateAttributes,
  BetaBuildLocalizationResponse,
  BetaBuildLocalizationUpdateAttributes,
  ListBetaAppLocalizationsOptions,
  ListBetaBuildLocalizationsOptions,
} from "./capabilities/beta-localizations.js";

export {
  getBetaAppReviewDetail,
  getBetaAppReviewSubmission,
  getBuildBetaAppReviewSubmission,
  listBetaAppReviewSubmissions,
  submitBuildForBetaReview,
  updateBetaAppReviewDetail,
} from "./capabilities/beta-review.js";
export type {
  BetaAppReviewDetail,
  BetaAppReviewDetailResponse,
  BetaAppReviewDetailUpdateAttributes,
  BetaAppReviewSubmission,
  BetaAppReviewSubmissionResponse,
  BetaReviewState,
  GetBetaAppReviewDetailOptions,
  ListBetaAppReviewSubmissionsOptions,
} from "./capabilities/beta-review.js";

export {
  getCrashFeedback,
  getCrashLog,
  getScreenshotFeedback,
  listCrashFeedback,
  listScreenshotFeedback,
} from "./capabilities/testflight-feedback.js";
export type {
  BetaCrashLog,
  BetaCrashLogResponse,
  BetaFeedbackCrashSubmission,
  BetaFeedbackCrashSubmissionResponse,
  BetaFeedbackScreenshotImage,
  BetaFeedbackScreenshotSubmission,
  BetaFeedbackScreenshotSubmissionResponse,
  GetCrashFeedbackOptions,
  GetScreenshotFeedbackOptions,
  ListFeedbackOptions,
} from "./capabilities/testflight-feedback.js";

export {
  downloadCrashFeedbackLog,
  downloadFeedbackAttachments,
  downloadScreenshotFeedbackAttachments,
} from "./workflows/feedback-files.js";
export type {
  DownloadFeedbackAttachmentsOptions,
  DownloadFeedbackTarget,
  FeedbackDownloadItem,
  FeedbackDownloadSummary,
  FeedbackKind,
  SavedCrashLogFile,
  SavedScreenshotFile,
} from "./workflows/feedback-files.js";

export {
  bulkAddTestersToGroup,
  DEFAULT_LINKAGE_BATCH_SIZE,
  ensureBetaGroup,
  findBetaAppReviewDetail,
  findRecruitmentCriterionId,
  setBetaAppReviewDetail,
  upsertBetaAppLocalization,
  upsertBetaBuildLocalization,
} from "./workflows/beta-distribution.js";
export type {
  BulkAddTestersResult,
  EnsureBetaGroupResult,
  UpsertLocalizationResult,
} from "./workflows/beta-distribution.js";

export {
  downloadExternalBinaryFile,
  saveBinaryStream,
} from "./workflows/report-files.js";
export type { SavedBinaryFile } from "./workflows/report-files.js";

export {
  createReviewSubmission,
  createReviewSubmissionItem,
  deleteReviewSubmissionItem,
  getReviewSubmission,
  listReviewSubmissionItems,
  listReviewSubmissions,
  updateReviewSubmission,
  updateReviewSubmissionItem,
} from "./capabilities/review-submissions.js";
export type {
  GetReviewSubmissionOptions,
  ListReviewSubmissionItemsOptions,
  ListReviewSubmissionsOptions,
  ReviewSubmission,
  ReviewSubmissionItem,
  ReviewSubmissionItemContent,
  ReviewSubmissionItemResponse,
  ReviewSubmissionItemState,
  ReviewSubmissionItemUpdateAttributes,
  ReviewSubmissionPlatform,
  ReviewSubmissionResponse,
  ReviewSubmissionState,
  ReviewSubmissionUpdateAttributes,
} from "./capabilities/review-submissions.js";

export {
  createAppStoreReviewDetail,
  findAppStoreReviewDetail,
  getAppStoreReviewDetail,
  updateAppStoreReviewDetail,
} from "./capabilities/app-store-review-details.js";
export type {
  AppStoreReviewDetail,
  AppStoreReviewDetailCreateAttributes,
  AppStoreReviewDetailResponse,
  AppStoreReviewDetailUpdateAttributes,
} from "./capabilities/app-store-review-details.js";

export {
  createAppStoreVersionReleaseRequest,
  getAppStoreVersion,
  getVersionAppStoreReviewDetail,
  getVersionBuild,
  getVersionPhasedRelease,
  updateAppStoreVersionRelease,
} from "./capabilities/app-store-versions-release.js";
// getVersionReviewSubmission reads the legacy, Apple-@deprecated
// appStoreVersionSubmission to-one relationship (status read only; modern
// review goes through reviewSubmissions). The deprecation is intrinsic to the
// contract resource, so the rule is suppressed exactly at this re-export.
// eslint-disable-next-line @typescript-eslint/no-deprecated
export { getVersionReviewSubmission } from "./capabilities/app-store-versions-release.js";
export type {
  AppStoreVersionPhasedReleaseResponse,
  AppStoreVersionReleaseConfig,
  AppStoreVersionReleaseRequestResponse,
  AppStoreVersionResponse,
  AppStoreVersionSubmissionResponse,
  AppVersionState,
  BuildWithoutIncludesResponse,
  GetAppStoreVersionOptions,
  PhasedReleaseState,
  ReleaseType,
} from "./capabilities/app-store-versions-release.js";

export { setBuildExportCompliance } from "./capabilities/export-compliance.js";

export { getAgeRatingDeclaration } from "./capabilities/age-rating.js";
export type { AgeRatingDeclaration } from "./capabilities/age-rating.js";

export {
  cancelReviewSubmission,
  releaseVersionNow,
  submitVersionForReview,
} from "./workflows/submission-assembly.js";
export type {
  CancelReviewSubmissionResult,
  ReleaseVersionNowResult,
  SubmitVersionForReviewResult,
} from "./workflows/submission-assembly.js";

export { preflightVersionSubmission } from "./workflows/submission-preflight.js";
export type {
  PreflightResult,
  PreflightSnapshot,
  SubmissionBlocker,
} from "./workflows/submission-preflight.js";

export type { components, operations, paths } from "./generated/asc-openapi.js";
