import type { components, operations } from "../generated/asc-openapi.js";
import { AscNotFoundError } from "../errors.js";
import type { AscClient } from "../http/client.js";
import { expectDocument } from "./internal.js";
import { readPaged } from "../pagination/paginate.js";
import type {
  CollectedRead,
  PaginateOptions,
  ReadScope,
} from "../pagination/paginate.js";

export type Build = components["schemas"]["Build"];
export type BuildResponse = components["schemas"]["BuildResponse"];
export type BuildBetaDetail = components["schemas"]["BuildBetaDetail"];
export type BuildBetaDetailResponse =
  components["schemas"]["BuildBetaDetailResponse"];
export type BetaTester = components["schemas"]["BetaTester"];
export type PrereleaseVersion = components["schemas"]["PrereleaseVersion"];
export type PrereleaseVersionResponse =
  components["schemas"]["PrereleaseVersionResponse"];

/** The contract enum for a build's processing state; VALID == ready to test. */
export type BuildProcessingState = NonNullable<
  Build["attributes"]
>["processingState"];
/** The platform filter (via preReleaseVersion.platform) on the builds list. */
export type BuildPlatform = NonNullable<
  BuildsQuery["filter[preReleaseVersion.platform]"]
>[number];
export type BuildAudienceType = components["schemas"]["BuildAudienceType"];

/** Only autoNotifyEnabled is writable on a buildBetaDetail; the rest is server-computed. */
export type BuildBetaDetailUpdateAttributes = NonNullable<
  components["schemas"]["BuildBetaDetailUpdateRequest"]["data"]["attributes"]
>;

type BuildsQuery = NonNullable<
  operations["builds_getCollection"]["parameters"]["query"]
>;
type BuildInstanceQuery = NonNullable<
  operations["builds_getInstance"]["parameters"]["query"]
>;
type BuildTestersQuery = NonNullable<
  operations["builds_individualTesters_getToManyRelated"]["parameters"]["query"]
>;
type PrereleaseVersionsQuery = NonNullable<
  operations["preReleaseVersions_getCollection"]["parameters"]["query"]
>;
type PrereleaseVersionBuildsQuery = NonNullable<
  operations["preReleaseVersions_builds_getToManyRelated"]["parameters"]["query"]
>;

export interface ListBuildsOptions {
  /** Read-cost declaration; always an explicit call-site decision. */
  readonly scope: ReadScope;
  readonly pageLimit?: BuildsQuery["limit"];
  readonly app?: BuildsQuery["filter[app]"];
  readonly preReleaseVersion?: BuildsQuery["filter[preReleaseVersion]"];
  /** Platform via the related preReleaseVersion (Apple has no direct platform on Build). */
  readonly platform?: BuildsQuery["filter[preReleaseVersion.platform]"];
  readonly processingState?: BuildsQuery["filter[processingState]"];
  readonly version?: BuildsQuery["filter[version]"];
  /** "true"/"false" string filter on the expired attribute. */
  readonly expired?: BuildsQuery["filter[expired]"];
  readonly audienceType?: BuildsQuery["filter[buildAudienceType]"];
  readonly betaGroups?: BuildsQuery["filter[betaGroups]"];
  readonly sort?: BuildsQuery["sort"];
  readonly fields?: BuildsQuery["fields[builds]"];
  readonly pagination?: PaginateOptions;
}

function buildBuildsQuery(options: ListBuildsOptions): BuildsQuery {
  return {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.app !== undefined && { "filter[app]": options.app }),
    ...(options.preReleaseVersion !== undefined && {
      "filter[preReleaseVersion]": options.preReleaseVersion,
    }),
    ...(options.platform !== undefined && {
      "filter[preReleaseVersion.platform]": options.platform,
    }),
    ...(options.processingState !== undefined && {
      "filter[processingState]": options.processingState,
    }),
    ...(options.version !== undefined && {
      "filter[version]": options.version,
    }),
    ...(options.expired !== undefined && {
      "filter[expired]": options.expired,
    }),
    ...(options.audienceType !== undefined && {
      "filter[buildAudienceType]": options.audienceType,
    }),
    ...(options.betaGroups !== undefined && {
      "filter[betaGroups]": options.betaGroups,
    }),
    ...(options.sort !== undefined && { sort: options.sort }),
    ...(options.fields !== undefined && { "fields[builds]": options.fields }),
  };
}

/** Reads builds, filterable by app, version, platform, processing state, etc. */
export function listBuilds(
  client: AscClient,
  options: ListBuildsOptions,
): Promise<CollectedRead<Build>> {
  return readPaged(
    client,
    "/v1/builds",
    { params: { query: buildBuildsQuery(options) } },
    options.scope,
    options.pagination,
  );
}

export interface GetBuildOptions {
  readonly fields?: BuildInstanceQuery["fields[builds]"];
  readonly include?: BuildInstanceQuery["include"];
}

/** Reads one build by ASC id, with optional related includes. */
export async function getBuild(
  client: AscClient,
  buildId: string,
  options: GetBuildOptions = {},
): Promise<BuildResponse> {
  const query: BuildInstanceQuery = {
    ...(options.fields !== undefined && { "fields[builds]": options.fields }),
    ...(options.include !== undefined && { include: options.include }),
  };
  const { data } = await client.GET("/v1/builds/{id}", {
    params: { path: { id: buildId }, query },
  });
  return expectDocument(data);
}

export interface FindLatestProcessedBuildOptions {
  readonly appId: string;
  readonly platform?: BuildPlatform;
  readonly audienceType?: BuildAudienceType;
}

/**
 * Resolves "the newest testable build for an app" — a pure composition over
 * listBuilds: filter by app (+ optional platform/audience), processingState
 * VALID (the contract's "processed/ready" state, enum is only
 * PROCESSING|FAILED|INVALID|VALID), sort -uploadedDate, take the first. A miss
 * throws AscNotFoundError rather than returning undefined, matching the
 * resolve-with-helpful-miss stance of the rest of the layer.
 */
export async function findLatestProcessedBuild(
  client: AscClient,
  options: FindLatestProcessedBuildOptions,
): Promise<Build> {
  const read = await listBuilds(client, {
    scope: { maxItems: 1 },
    app: [options.appId],
    // live-verify (实机核实 #8): VALID is the correct "latest processed" filter.
    processingState: ["VALID"],
    sort: ["-uploadedDate"],
    ...(options.platform !== undefined && { platform: [options.platform] }),
    ...(options.audienceType !== undefined && {
      audienceType: [options.audienceType],
    }),
  });
  const match = read.items[0];
  if (match === undefined) {
    const platformNote =
      options.platform !== undefined ? ` for platform ${options.platform}` : "";
    const audienceNote =
      options.audienceType !== undefined
        ? ` in audience ${options.audienceType}`
        : "";
    throw new AscNotFoundError(
      `App ${options.appId} has no processed (VALID) build${platformNote}${audienceNote}.`,
    );
  }
  return match;
}

/**
 * Expires a build (PATCH expired=true). One-way and irreversible: Apple's API
 * has no un-expire, so the caller must gate this behind an explicit force.
 */
export async function expireBuild(
  client: AscClient,
  buildId: string,
): Promise<BuildResponse> {
  const { data } = await client.PATCH("/v1/builds/{id}", {
    params: { path: { id: buildId } },
    body: {
      data: { type: "builds", id: buildId, attributes: { expired: true } },
    },
  });
  return expectDocument(data);
}

/** Reads a build's buildBetaDetail (internal/external state + autoNotify) from the build side. */
export async function getBuildBetaDetail(
  client: AscClient,
  buildId: string,
): Promise<BuildBetaDetailResponse> {
  const { data } = await client.GET("/v1/builds/{id}/buildBetaDetail", {
    params: { path: { id: buildId } },
  });
  return expectDocument(data);
}

/**
 * Updates a buildBetaDetail. autoNotifyEnabled is the ONLY writable field
 * (internal/external build states are server-computed and read-only); the
 * update request type enforces that. Takes the buildBetaDetail id, not the
 * build id.
 */
export async function updateBuildBetaDetail(
  client: AscClient,
  buildBetaDetailId: string,
  attributes: BuildBetaDetailUpdateAttributes,
): Promise<BuildBetaDetailResponse> {
  const { data } = await client.PATCH("/v1/buildBetaDetails/{id}", {
    params: { path: { id: buildBetaDetailId } },
    body: {
      data: { type: "buildBetaDetails", id: buildBetaDetailId, attributes },
    },
  });
  return expectDocument(data);
}

/**
 * Distributes a build to beta groups via the build-side relationship POST — the
 * canonical distribution-edit end. Adding an external group makes the build
 * visible to external testers (may require prior beta review) — a real side
 * effect. Groups with hasAccessToAllBuilds reject explicit linkage; the
 * `builds groups add` CLI handler reads each target group's
 * hasAccessToAllBuilds and surfaces a clear usage error (exit 64) before
 * reaching this POST, rather than sending a doomed request.
 */
export async function assignBuildToBetaGroups(
  client: AscClient,
  buildId: string,
  groupIds: readonly string[],
): Promise<void> {
  await client.POST("/v1/builds/{id}/relationships/betaGroups", {
    params: { path: { id: buildId } },
    body: { data: groupIds.map((id) => ({ type: "betaGroups" as const, id })) },
  });
}

/** Removes a build from beta groups (build-side relationship DELETE). */
export async function removeBuildFromBetaGroups(
  client: AscClient,
  buildId: string,
  groupIds: readonly string[],
): Promise<void> {
  await client.DELETE("/v1/builds/{id}/relationships/betaGroups", {
    params: { path: { id: buildId } },
    body: { data: groupIds.map((id) => ({ type: "betaGroups" as const, id })) },
  });
}

export interface ListBuildIndividualTestersOptions {
  readonly scope: ReadScope;
  readonly pageLimit?: BuildTestersQuery["limit"];
  readonly fields?: BuildTestersQuery["fields[betaTesters]"];
  readonly pagination?: PaginateOptions;
}

/** Reads a build's individual (per-build) testers. */
export function listBuildIndividualTesters(
  client: AscClient,
  buildId: string,
  options: ListBuildIndividualTestersOptions,
): Promise<CollectedRead<BetaTester>> {
  const query: BuildTestersQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.fields !== undefined && {
      "fields[betaTesters]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/builds/{id}/individualTesters",
    { params: { path: { id: buildId }, query } },
    options.scope,
    options.pagination,
  );
}

/**
 * Adds individual testers to a build. Whether this notifies the testers is not
 * yet confirmed (live-verify #7); treated as potentially notifying.
 */
export async function addIndividualTesters(
  client: AscClient,
  buildId: string,
  testerIds: readonly string[],
): Promise<void> {
  await client.POST("/v1/builds/{id}/relationships/individualTesters", {
    params: { path: { id: buildId } },
    body: {
      data: testerIds.map((id) => ({ type: "betaTesters" as const, id })),
    },
  });
}

/** Removes individual testers from a build. */
export async function removeIndividualTesters(
  client: AscClient,
  buildId: string,
  testerIds: readonly string[],
): Promise<void> {
  await client.DELETE("/v1/builds/{id}/relationships/individualTesters", {
    params: { path: { id: buildId } },
    body: {
      data: testerIds.map((id) => ({ type: "betaTesters" as const, id })),
    },
  });
}

export interface ListPreReleaseVersionsOptions {
  readonly scope: ReadScope;
  readonly pageLimit?: PrereleaseVersionsQuery["limit"];
  readonly app?: PrereleaseVersionsQuery["filter[app]"];
  readonly platform?: PrereleaseVersionsQuery["filter[platform]"];
  readonly version?: PrereleaseVersionsQuery["filter[version]"];
  readonly sort?: PrereleaseVersionsQuery["sort"];
  readonly fields?: PrereleaseVersionsQuery["fields[preReleaseVersions]"];
  readonly pagination?: PaginateOptions;
}

/** Reads pre-release (train) versions, filterable by app/platform/version. */
export function listPreReleaseVersions(
  client: AscClient,
  options: ListPreReleaseVersionsOptions,
): Promise<CollectedRead<PrereleaseVersion>> {
  const query: PrereleaseVersionsQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.app !== undefined && { "filter[app]": options.app }),
    ...(options.platform !== undefined && {
      "filter[platform]": options.platform,
    }),
    ...(options.version !== undefined && {
      "filter[version]": options.version,
    }),
    ...(options.sort !== undefined && { sort: options.sort }),
    ...(options.fields !== undefined && {
      "fields[preReleaseVersions]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/preReleaseVersions",
    { params: { query } },
    options.scope,
    options.pagination,
  );
}

/** Reads one pre-release version by ASC id. */
export async function getPreReleaseVersion(
  client: AscClient,
  versionId: string,
): Promise<PrereleaseVersionResponse> {
  const { data } = await client.GET("/v1/preReleaseVersions/{id}", {
    params: { path: { id: versionId } },
  });
  return expectDocument(data);
}

export interface ListPreReleaseVersionBuildsOptions {
  readonly scope: ReadScope;
  readonly pageLimit?: PrereleaseVersionBuildsQuery["limit"];
  readonly fields?: PrereleaseVersionBuildsQuery["fields[builds]"];
  readonly pagination?: PaginateOptions;
}

/** Reads the builds within one pre-release (train) version. */
export function listPreReleaseVersionBuilds(
  client: AscClient,
  versionId: string,
  options: ListPreReleaseVersionBuildsOptions,
): Promise<CollectedRead<Build>> {
  const query: PrereleaseVersionBuildsQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.fields !== undefined && { "fields[builds]": options.fields }),
  };
  return readPaged(
    client,
    "/v1/preReleaseVersions/{id}/builds",
    { params: { path: { id: versionId }, query } },
    options.scope,
    options.pagination,
  );
}
