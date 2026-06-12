import type { components, operations } from "../generated/asc-openapi.js";
import type { AscClient } from "../http/client.js";
import { expectDocument } from "./internal.js";
import { readPaged } from "../pagination/paginate.js";
import type {
  CollectedRead,
  PaginateOptions,
  ReadScope,
} from "../pagination/paginate.js";

export type AnalyticsReportRequest =
  components["schemas"]["AnalyticsReportRequest"];
export type AnalyticsReportRequestResponse =
  components["schemas"]["AnalyticsReportRequestResponse"];
export type AnalyticsReport = components["schemas"]["AnalyticsReport"];
export type AnalyticsReportInstance =
  components["schemas"]["AnalyticsReportInstance"];
export type AnalyticsReportSegment =
  components["schemas"]["AnalyticsReportSegment"];

/** Scalar accessType, as the create request types it (filters use arrays). */
export type AnalyticsReportAccessType =
  components["schemas"]["AnalyticsReportRequestCreateRequest"]["data"]["attributes"]["accessType"];

type RequestsQuery = NonNullable<
  operations["apps_analyticsReportRequests_getToManyRelated"]["parameters"]["query"]
>;
type RequestInstanceQuery = NonNullable<
  operations["analyticsReportRequests_getInstance"]["parameters"]["query"]
>;
type ReportsQuery = NonNullable<
  operations["analyticsReportRequests_reports_getToManyRelated"]["parameters"]["query"]
>;
type InstancesQuery = NonNullable<
  operations["analyticsReports_instances_getToManyRelated"]["parameters"]["query"]
>;
type SegmentsQuery = NonNullable<
  operations["analyticsReportInstances_segments_getToManyRelated"]["parameters"]["query"]
>;

export type AnalyticsReportCategory = NonNullable<
  ReportsQuery["filter[category]"]
>[number];
export type AnalyticsReportGranularity = NonNullable<
  InstancesQuery["filter[granularity]"]
>[number];

export interface ListAnalyticsReportRequestsOptions {
  /** Read-cost declaration; always an explicit call-site decision. */
  readonly scope: ReadScope;
  readonly pageLimit?: RequestsQuery["limit"];
  readonly accessType?: RequestsQuery["filter[accessType]"];
  readonly fields?: RequestsQuery["fields[analyticsReportRequests]"];
  readonly pagination?: PaginateOptions;
}

/** Reads an app's analytics report requests (both access types unless filtered). */
export function listAnalyticsReportRequests(
  client: AscClient,
  appId: string,
  options: ListAnalyticsReportRequestsOptions,
): Promise<CollectedRead<AnalyticsReportRequest>> {
  const query: RequestsQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.accessType !== undefined && {
      "filter[accessType]": options.accessType,
    }),
    ...(options.fields !== undefined && {
      "fields[analyticsReportRequests]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/apps/{id}/analyticsReportRequests",
    { params: { path: { id: appId }, query } },
    options.scope,
    options.pagination,
  );
}

export interface GetAnalyticsReportRequestOptions {
  readonly fields?: RequestInstanceQuery["fields[analyticsReportRequests]"];
}

/** Reads one analytics report request by its ASC id. */
export async function getAnalyticsReportRequest(
  client: AscClient,
  requestId: string,
  options: GetAnalyticsReportRequestOptions = {},
): Promise<AnalyticsReportRequestResponse> {
  const query: RequestInstanceQuery = {
    ...(options.fields !== undefined && {
      "fields[analyticsReportRequests]": options.fields,
    }),
  };
  const { data } = await client.GET("/v1/analyticsReportRequests/{id}", {
    params: { path: { id: requestId }, query },
  });
  return expectDocument(data);
}

/**
 * Creates an analytics report request for an app. Apple generates the first
 * data 1-2 days later; ONGOING requests then refresh continuously, and
 * reading them is what keeps them from being stopped for inactivity.
 */
export async function createAnalyticsReportRequest(
  client: AscClient,
  appId: string,
  accessType: AnalyticsReportAccessType,
): Promise<AnalyticsReportRequestResponse> {
  const { data } = await client.POST("/v1/analyticsReportRequests", {
    body: {
      data: {
        type: "analyticsReportRequests",
        attributes: { accessType },
        relationships: {
          app: {
            data: { type: "apps", id: appId },
          },
        },
      },
    },
  });
  return expectDocument(data);
}

/**
 * Deletes an analytics report request. Destructive: Apple discards the
 * request's accumulated reports and a replacement starts the 1-2 day
 * first-data wait from zero — recovery from a stopped request does NOT
 * require this (creating a new request suffices, per Apple's docs).
 */
export async function deleteAnalyticsReportRequest(
  client: AscClient,
  requestId: string,
): Promise<void> {
  await client.DELETE("/v1/analyticsReportRequests/{id}", {
    params: { path: { id: requestId } },
  });
}

export interface ListAnalyticsReportsOptions {
  readonly scope: ReadScope;
  readonly pageLimit?: ReportsQuery["limit"];
  readonly category?: ReportsQuery["filter[category]"];
  /** Exact report names, e.g. ["App Store Installation and Deletion Standard"]. */
  readonly name?: ReportsQuery["filter[name]"];
  readonly fields?: ReportsQuery["fields[analyticsReports]"];
  readonly pagination?: PaginateOptions;
}

/** Reads the reports Apple generated for one analytics report request. */
export function listAnalyticsReports(
  client: AscClient,
  requestId: string,
  options: ListAnalyticsReportsOptions,
): Promise<CollectedRead<AnalyticsReport>> {
  const query: ReportsQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.category !== undefined && {
      "filter[category]": options.category,
    }),
    ...(options.name !== undefined && { "filter[name]": options.name }),
    ...(options.fields !== undefined && {
      "fields[analyticsReports]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/analyticsReportRequests/{id}/reports",
    { params: { path: { id: requestId }, query } },
    options.scope,
    options.pagination,
  );
}

export interface ListAnalyticsReportInstancesOptions {
  readonly scope: ReadScope;
  readonly pageLimit?: InstancesQuery["limit"];
  readonly granularity?: InstancesQuery["filter[granularity]"];
  /** ISO dates (YYYY-MM-DD), matching the instance's processingDate. */
  readonly processingDate?: InstancesQuery["filter[processingDate]"];
  readonly fields?: InstancesQuery["fields[analyticsReportInstances]"];
  readonly pagination?: PaginateOptions;
}

/** Reads one analytics report's dated instances. */
export function listAnalyticsReportInstances(
  client: AscClient,
  reportId: string,
  options: ListAnalyticsReportInstancesOptions,
): Promise<CollectedRead<AnalyticsReportInstance>> {
  const query: InstancesQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.granularity !== undefined && {
      "filter[granularity]": options.granularity,
    }),
    ...(options.processingDate !== undefined && {
      "filter[processingDate]": options.processingDate,
    }),
    ...(options.fields !== undefined && {
      "fields[analyticsReportInstances]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/analyticsReports/{id}/instances",
    { params: { path: { id: reportId }, query } },
    options.scope,
    options.pagination,
  );
}

export interface ListAnalyticsReportSegmentsOptions {
  readonly scope: ReadScope;
  readonly pageLimit?: SegmentsQuery["limit"];
  readonly fields?: SegmentsQuery["fields[analyticsReportSegments]"];
  readonly pagination?: PaginateOptions;
}

/**
 * Reads one instance's downloadable segments. Each segment's `url` is a
 * short-lived, unauthenticated external download address — fetch it promptly
 * and never through the authenticated client.
 */
export function listAnalyticsReportSegments(
  client: AscClient,
  instanceId: string,
  options: ListAnalyticsReportSegmentsOptions,
): Promise<CollectedRead<AnalyticsReportSegment>> {
  const query: SegmentsQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.fields !== undefined && {
      "fields[analyticsReportSegments]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/analyticsReportInstances/{id}/segments",
    { params: { path: { id: instanceId }, query } },
    options.scope,
    options.pagination,
  );
}
