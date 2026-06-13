// TestFlight beta feedback — crash and screenshot submissions.
//
// Feedback is READ-ONLY in this skill: the API exposes a DELETE on each
// submission, but deleting tester feedback is intentionally out of scope (low
// value, only widens the command surface). No delete functions live here.
//
// Lists are app-scoped only: Apple has no by-build or by-tester collection
// path, so narrowing to a build/tester is done with filters on the app
// collection. Sort is limited to ±createdDate.

import type { components, operations } from "../generated/asc-openapi.js";
import type { AscClient } from "../http/client.js";
import { expectDocument } from "./internal.js";
import { readPaged } from "../pagination/paginate.js";
import type {
  CollectedRead,
  PaginateOptions,
  ReadScope,
} from "../pagination/paginate.js";

export type BetaFeedbackCrashSubmission =
  components["schemas"]["BetaFeedbackCrashSubmission"];
export type BetaFeedbackCrashSubmissionResponse =
  components["schemas"]["BetaFeedbackCrashSubmissionResponse"];
export type BetaFeedbackScreenshotSubmission =
  components["schemas"]["BetaFeedbackScreenshotSubmission"];
export type BetaFeedbackScreenshotSubmissionResponse =
  components["schemas"]["BetaFeedbackScreenshotSubmissionResponse"];
export type BetaFeedbackScreenshotImage =
  components["schemas"]["BetaFeedbackScreenshotImage"];
export type BetaCrashLog = components["schemas"]["BetaCrashLog"];
export type BetaCrashLogResponse =
  components["schemas"]["BetaCrashLogResponse"];

type CrashListQuery = NonNullable<
  operations["apps_betaFeedbackCrashSubmissions_getToManyRelated"]["parameters"]["query"]
>;
type ScreenshotListQuery = NonNullable<
  operations["apps_betaFeedbackScreenshotSubmissions_getToManyRelated"]["parameters"]["query"]
>;
type CrashInstanceQuery = NonNullable<
  operations["betaFeedbackCrashSubmissions_getInstance"]["parameters"]["query"]
>;
type ScreenshotInstanceQuery = NonNullable<
  operations["betaFeedbackScreenshotSubmissions_getInstance"]["parameters"]["query"]
>;

/**
 * Shared list options for both feedback kinds. The two app-scoped collections
 * take the same filter/sort surface (only `deviceModel`/`osVersion` are string
 * filters; `build`/`tester` are id filters), so one options shape serves both.
 */
export interface ListFeedbackOptions {
  /** Read-cost declaration; always an explicit call-site decision. */
  readonly scope: ReadScope;
  readonly pageLimit?: number;
  /** Narrow to a specific build id(s). */
  readonly build?: readonly string[];
  /** Narrow to a specific tester id(s). */
  readonly tester?: readonly string[];
  readonly deviceModel?: readonly string[];
  readonly osVersion?: readonly string[];
  /** Only "createdDate" / "-createdDate" are valid. */
  readonly sort?: CrashListQuery["sort"];
  readonly pagination?: PaginateOptions;
}

/** Reads an app's crash feedback submissions. */
export function listCrashFeedback(
  client: AscClient,
  appId: string,
  options: ListFeedbackOptions,
): Promise<CollectedRead<BetaFeedbackCrashSubmission>> {
  const query: CrashListQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.build !== undefined && { "filter[build]": [...options.build] }),
    ...(options.tester !== undefined && {
      "filter[tester]": [...options.tester],
    }),
    ...(options.deviceModel !== undefined && {
      "filter[deviceModel]": [...options.deviceModel],
    }),
    ...(options.osVersion !== undefined && {
      "filter[osVersion]": [...options.osVersion],
    }),
    ...(options.sort !== undefined && { sort: options.sort }),
  };
  return readPaged(
    client,
    "/v1/apps/{id}/betaFeedbackCrashSubmissions",
    { params: { path: { id: appId }, query } },
    options.scope,
    options.pagination,
  );
}

export interface GetCrashFeedbackOptions {
  readonly include?: CrashInstanceQuery["include"];
}

/** Reads one crash feedback submission by ASC id. */
export async function getCrashFeedback(
  client: AscClient,
  submissionId: string,
  options: GetCrashFeedbackOptions = {},
): Promise<BetaFeedbackCrashSubmissionResponse> {
  const query: CrashInstanceQuery = {
    ...(options.include !== undefined && { include: options.include }),
  };
  const { data } = await client.GET("/v1/betaFeedbackCrashSubmissions/{id}", {
    params: { path: { id: submissionId }, query },
  });
  return expectDocument(data);
}

/**
 * Reads the crash log behind a crash submission. The log text is inlined in the
 * authenticated JSON (`attributes.logText`) — there is no signed URL; the
 * "download" is writing this property to disk (see workflows/feedback-files).
 */
export async function getCrashLog(
  client: AscClient,
  submissionId: string,
): Promise<BetaCrashLogResponse> {
  const { data } = await client.GET(
    "/v1/betaFeedbackCrashSubmissions/{id}/crashLog",
    { params: { path: { id: submissionId } } },
  );
  return expectDocument(data);
}

/** Reads an app's screenshot feedback submissions. */
export function listScreenshotFeedback(
  client: AscClient,
  appId: string,
  options: ListFeedbackOptions,
): Promise<CollectedRead<BetaFeedbackScreenshotSubmission>> {
  const query: ScreenshotListQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.build !== undefined && { "filter[build]": [...options.build] }),
    ...(options.tester !== undefined && {
      "filter[tester]": [...options.tester],
    }),
    ...(options.deviceModel !== undefined && {
      "filter[deviceModel]": [...options.deviceModel],
    }),
    ...(options.osVersion !== undefined && {
      "filter[osVersion]": [...options.osVersion],
    }),
    ...(options.sort !== undefined && { sort: options.sort }),
  };
  return readPaged(
    client,
    "/v1/apps/{id}/betaFeedbackScreenshotSubmissions",
    { params: { path: { id: appId }, query } },
    options.scope,
    options.pagination,
  );
}

export interface GetScreenshotFeedbackOptions {
  readonly include?: ScreenshotInstanceQuery["include"];
}

/**
 * Reads one screenshot feedback submission by ASC id. The screenshots live in
 * `attributes.screenshots[]` as short-lived signed URLs (+ width/height/
 * expirationDate, NO fileName) — fetched auth-free by the download workflow.
 */
export async function getScreenshotFeedback(
  client: AscClient,
  submissionId: string,
  options: GetScreenshotFeedbackOptions = {},
): Promise<BetaFeedbackScreenshotSubmissionResponse> {
  const query: ScreenshotInstanceQuery = {
    ...(options.include !== undefined && { include: options.include }),
  };
  const { data } = await client.GET(
    "/v1/betaFeedbackScreenshotSubmissions/{id}",
    { params: { path: { id: submissionId }, query } },
  );
  return expectDocument(data);
}
