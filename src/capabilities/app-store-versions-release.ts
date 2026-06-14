import type { components, operations } from "../generated/asc-openapi.js";
import type { AscClient } from "../http/client.js";
import { expectDocument } from "./internal.js";

export type AppStoreVersionResponse =
  components["schemas"]["AppStoreVersionResponse"];
export type AppStoreVersionReleaseRequestResponse =
  components["schemas"]["AppStoreVersionReleaseRequestResponse"];
export type AppStoreReviewDetailResponse =
  components["schemas"]["AppStoreReviewDetailResponse"];
export type AppStoreVersionPhasedReleaseResponse =
  components["schemas"]["AppStoreVersionPhasedReleaseResponse"];
export type AppStoreVersionSubmissionResponse =
  components["schemas"]["AppStoreVersionSubmissionResponse"];
export type BuildWithoutIncludesResponse =
  components["schemas"]["BuildWithoutIncludesResponse"];

/** The current (non-deprecated) version lifecycle state, read-only. */
export type AppVersionState = components["schemas"]["AppVersionState"];
/** Phased-release runtime state (read-only in this phase, decision B2). */
export type PhasedReleaseState = components["schemas"]["PhasedReleaseState"];
/** The release-timing enum on a version. */
export type ReleaseType = NonNullable<
  components["schemas"]["AppStoreVersionUpdateRequest"]["data"]["attributes"]
>["releaseType"];

type AppStoreVersionInstanceQuery = NonNullable<
  operations["appStoreVersions_getInstance"]["parameters"]["query"]
>;

// ---------------------------------------------------------------------------
// Version instance read (new: modeled on getApp, returns the full *Response so
// callers can ask for include relationships without reshaping)
// ---------------------------------------------------------------------------

export interface GetAppStoreVersionOptions {
  readonly include?: AppStoreVersionInstanceQuery["include"];
  readonly fields?: AppStoreVersionInstanceQuery["fields[appStoreVersions]"];
  readonly buildFields?: AppStoreVersionInstanceQuery["fields[builds]"];
  readonly reviewDetailFields?: AppStoreVersionInstanceQuery["fields[appStoreReviewDetails]"];
  readonly phasedReleaseFields?: AppStoreVersionInstanceQuery["fields[appStoreVersionPhasedReleases]"];
}

/**
 * Reads one App Store version by ASC id, returning the full response document
 * so `include` (build / review-detail / phased-release / submission) arrives
 * intact in `included`. The list endpoint is app-scoped and has no single read,
 * so this is the version-by-id entry the preflight and status flows aggregate.
 */
export async function getAppStoreVersion(
  client: AscClient,
  versionId: string,
  options: GetAppStoreVersionOptions = {},
): Promise<AppStoreVersionResponse> {
  const query: AppStoreVersionInstanceQuery = {
    ...(options.include !== undefined && { include: options.include }),
    ...(options.fields !== undefined && {
      "fields[appStoreVersions]": options.fields,
    }),
    ...(options.buildFields !== undefined && {
      "fields[builds]": options.buildFields,
    }),
    ...(options.reviewDetailFields !== undefined && {
      "fields[appStoreReviewDetails]": options.reviewDetailFields,
    }),
    ...(options.phasedReleaseFields !== undefined && {
      "fields[appStoreVersionPhasedReleases]": options.phasedReleaseFields,
    }),
  };
  const { data } = await client.GET("/v1/appStoreVersions/{id}", {
    params: { path: { id: versionId }, query },
  });
  return expectDocument(data);
}

// ---------------------------------------------------------------------------
// Release configuration (low side-effect PATCH on the version)
// ---------------------------------------------------------------------------

export interface AppStoreVersionReleaseConfig {
  readonly releaseType?: ReleaseType;
  /** ISO date-time; only meaningful with releaseType SCHEDULED. */
  readonly earliestReleaseDate?: string | null;
  readonly downloadable?: boolean | null;
  /** Build id to attach/swap; the version-side build relationship. */
  readonly buildId?: string;
}

/**
 * Configures a version's release timing and attached build: releaseType
 * (MANUAL / AFTER_APPROVAL / SCHEDULED), earliestReleaseDate, downloadable, and
 * the build relationship. Reuses the AppStoreVersionUpdateRequest the metadata
 * layer already touches; low/zero side-effect, so no --force gating. Apple's
 * version-editable-state matrix is not pre-validated here — a non-editable
 * version surfaces as STATE_ERROR through the normal error path.
 */
export async function updateAppStoreVersionRelease(
  client: AscClient,
  versionId: string,
  config: AppStoreVersionReleaseConfig,
): Promise<AppStoreVersionResponse> {
  const attributes = {
    ...(config.releaseType !== undefined && {
      releaseType: config.releaseType,
    }),
    ...(config.earliestReleaseDate !== undefined && {
      earliestReleaseDate: config.earliestReleaseDate,
    }),
    ...(config.downloadable !== undefined && {
      downloadable: config.downloadable,
    }),
  };
  const { data } = await client.PATCH("/v1/appStoreVersions/{id}", {
    params: { path: { id: versionId } },
    body: {
      data: {
        type: "appStoreVersions",
        id: versionId,
        attributes,
        ...(config.buildId !== undefined && {
          relationships: {
            build: { data: { type: "builds", id: config.buildId } },
          },
        }),
      },
    },
  });
  return expectDocument(data);
}

// ---------------------------------------------------------------------------
// Manual release-to-public (high side-effect; build resource, not a PATCH)
// ---------------------------------------------------------------------------

/**
 * Triggers an immediate release-to-public of an approved version by creating an
 * appStoreVersionReleaseRequest. The resource has no attributes — only the
 * appStoreVersion relationship is required. This is the "release now" button for
 * a MANUAL + PENDING_DEVELOPER_RELEASE version: fire-and-forget, modeled as
 * async-accept. High side-effect; the caller (CLI --force layer) gates it and
 * it is NEVER exercised by the smoke script. live-verify (实机核实 #9):
 * pre-conditions, the async accept code, and irreversibility.
 */
export async function createAppStoreVersionReleaseRequest(
  client: AscClient,
  versionId: string,
): Promise<AppStoreVersionReleaseRequestResponse> {
  const { data } = await client.POST("/v1/appStoreVersionReleaseRequests", {
    body: {
      data: {
        type: "appStoreVersionReleaseRequests",
        relationships: {
          appStoreVersion: {
            data: { type: "appStoreVersions", id: versionId },
          },
        },
      },
    },
  });
  return expectDocument(data);
}

// ---------------------------------------------------------------------------
// Version-side to-one related reads (for preflight / status aggregation)
// ---------------------------------------------------------------------------

/** Reads a version's App Store review detail via the version-side to-one read. */
export async function getVersionAppStoreReviewDetail(
  client: AscClient,
  versionId: string,
): Promise<AppStoreReviewDetailResponse> {
  const { data } = await client.GET(
    "/v1/appStoreVersions/{id}/appStoreReviewDetail",
    { params: { path: { id: versionId } } },
  );
  return expectDocument(data);
}

/**
 * Reads a version's legacy appStoreVersionSubmission via the version-side
 * to-one read. The resource is @deprecated in the contract (modern review goes
 * through reviewSubmissions); exposed only as a status read, never created.
 */
export async function getVersionReviewSubmission(
  client: AscClient,
  versionId: string,
): Promise<AppStoreVersionSubmissionResponse> {
  const { data } = await client.GET(
    "/v1/appStoreVersions/{id}/appStoreVersionSubmission",
    { params: { path: { id: versionId } } },
  );
  return expectDocument(data);
}

/** Reads a version's phased-release status via the version-side to-one read. */
export async function getVersionPhasedRelease(
  client: AscClient,
  versionId: string,
): Promise<AppStoreVersionPhasedReleaseResponse> {
  const { data } = await client.GET(
    "/v1/appStoreVersions/{id}/appStoreVersionPhasedRelease",
    { params: { path: { id: versionId } } },
  );
  return expectDocument(data);
}

/** Reads a version's attached build via the version-side to-one read. */
export async function getVersionBuild(
  client: AscClient,
  versionId: string,
): Promise<BuildWithoutIncludesResponse> {
  const { data } = await client.GET("/v1/appStoreVersions/{id}/build", {
    params: { path: { id: versionId } },
  });
  return expectDocument(data);
}
