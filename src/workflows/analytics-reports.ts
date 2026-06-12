import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
  createAnalyticsReportRequest,
  listAnalyticsReportInstances,
  listAnalyticsReportRequests,
  listAnalyticsReports,
  listAnalyticsReportSegments,
} from "../capabilities/analytics-reports.js";
import type {
  AnalyticsReport,
  AnalyticsReportAccessType,
  AnalyticsReportCategory,
  AnalyticsReportGranularity,
  AnalyticsReportInstance,
  AnalyticsReportRequest,
} from "../capabilities/analytics-reports.js";
import {
  AscFileProcessingError,
  AscInvalidParameterError,
  AscNotFoundError,
  AscUpstreamError,
} from "../errors.js";
import type { AscClient } from "../http/client.js";
import {
  analyticsSegmentFileName,
  defaultAnalyticsReportDirName,
  downloadExternalFile,
} from "./report-files.js";

export interface EnsureAnalyticsReportRequestResult {
  readonly request: AnalyticsReportRequest;
  /** False when an existing active request of this accessType was reused. */
  readonly created: boolean;
  /** Same-accessType requests Apple stopped for inactivity, left in place. */
  readonly stoppedRequestIds: readonly string[];
}

/**
 * Idempotent "the app has a usable analytics report request" operation:
 * list-then-create, reusing the active request when one exists.
 *
 * Stopped requests (Apple halts ONGOING requests that go unread) are
 * reported but never deleted here: Apple's documented recovery is simply
 * creating a new request, while deletion discards the accumulated reports —
 * that destructive cleanup stays behind the explicit delete-request verb.
 */
export async function ensureAnalyticsReportRequest(
  client: AscClient,
  appId: string,
  accessType: AnalyticsReportAccessType,
): Promise<EnsureAnalyticsReportRequestResult> {
  const existing = await listAnalyticsReportRequests(client, appId, {
    scope: "all-pages",
    accessType: [accessType],
  });
  const stoppedRequestIds = existing.items
    .filter((request) => request.attributes?.stoppedDueToInactivity === true)
    .map((request) => request.id);
  const active = existing.items.find(
    (request) => request.attributes?.stoppedDueToInactivity !== true,
  );
  if (active !== undefined) {
    return { request: active, created: false, stoppedRequestIds };
  }

  const created = await createAnalyticsReportRequest(client, appId, accessType);
  return { request: created.data, created: true, stoppedRequestIds };
}

export interface AnalyticsReportSelector {
  readonly appId: string;
  readonly accessType: AnalyticsReportAccessType;
  /** Exact report name, e.g. "App Downloads Standard". */
  readonly reportName: string;
  readonly category?: AnalyticsReportCategory;
  readonly granularity?: AnalyticsReportGranularity;
  /** Instance processing date (YYYY-MM-DD); omitted = the latest instance. */
  readonly processingDate?: string;
}

export interface DownloadedAnalyticsSegment {
  readonly segmentId: string;
  readonly path: string;
  readonly bytesWritten: number;
  readonly rows: number;
  /** Apple's declared checksum, verbatim; null when Apple omitted it. */
  readonly checksum: string | null;
  /** True when the declared checksum was recognizable and enforced. */
  readonly checksumVerified: boolean;
}

export interface AnalyticsInstanceDownload {
  readonly directory: string;
  readonly segments: readonly DownloadedAnalyticsSegment[];
}

export interface AnalyticsReportDownload extends AnalyticsInstanceDownload {
  readonly request: AnalyticsReportRequest;
  readonly report: AnalyticsReport;
  readonly instance: AnalyticsReportInstance;
}

/**
 * Apple does not document the segment checksum algorithm (M5 核实项 2). A
 * 32-hex-digit value (with or without an "md5:" prefix) is treated as MD5
 * over the transferred bytes and enforced; anything else is recorded but not
 * enforced, so an undocumented format change degrades to an unverified
 * download instead of a hard failure.
 */
function extractMd5(checksum: string | null): string | undefined {
  if (checksum === null) {
    return undefined;
  }
  const match = /^(?:md5:)?([0-9a-f]{32})$/i.exec(checksum.trim());
  return match?.[1];
}

/**
 * Downloads every segment of one analytics report instance into a directory.
 * Segments download sequentially on purpose: counts are small, ordering
 * keeps the run auditable, and the external CDN gains nothing from
 * parallelism here.
 */
export async function downloadAnalyticsInstance(
  client: AscClient,
  instanceId: string,
  directory: string,
): Promise<AnalyticsInstanceDownload> {
  const segments = await listAnalyticsReportSegments(client, instanceId, {
    scope: "all-pages",
  });
  if (segments.items.length === 0) {
    throw new AscNotFoundError(
      `Analytics report instance ${instanceId} has no downloadable segments yet. Segments appear when Apple finishes generating the instance; retry shortly.`,
    );
  }
  try {
    await mkdir(directory, { recursive: true });
  } catch (error) {
    throw new AscFileProcessingError(
      `Creating the report directory failed: ${error instanceof Error ? error.message : String(error)}`,
      "write",
      { target: directory, cause: error },
    );
  }

  const downloaded: DownloadedAnalyticsSegment[] = [];
  for (const [index, segment] of segments.items.entries()) {
    const url = segment.attributes?.url;
    if (url === undefined) {
      throw new AscUpstreamError(
        `Analytics segment ${segment.id} carries no download URL.`,
      );
    }
    const checksum = segment.attributes?.checksum ?? null;
    const expectedMd5 = extractMd5(checksum);
    const saved = await downloadExternalFile(
      url,
      join(directory, analyticsSegmentFileName(index, "csv")),
      { ...(expectedMd5 !== undefined && { expectedMd5 }) },
    );
    downloaded.push({
      segmentId: segment.id,
      path: saved.path,
      bytesWritten: saved.bytesWritten,
      rows: saved.rows,
      checksum,
      checksumVerified: expectedMd5 !== undefined,
    });
  }
  return { directory, segments: downloaded };
}

/**
 * The one-shot chain: active request → report by name → instance → all
 * segments on disk. Resolution failures answer with what IS available
 * (report names, instance coordinates) instead of a bare not-found.
 *
 * Deliberately read-only on the ASC side — a download never creates a
 * report request; that mutation stays behind the explicit ensure-request.
 */
export async function downloadAnalyticsReport(
  client: AscClient,
  selector: AnalyticsReportSelector,
  options: { readonly directory?: string } = {},
): Promise<AnalyticsReportDownload> {
  const requests = await listAnalyticsReportRequests(client, selector.appId, {
    scope: "all-pages",
    accessType: [selector.accessType],
  });
  const request = requests.items.find(
    (candidate) => candidate.attributes?.stoppedDueToInactivity !== true,
  );
  if (request === undefined) {
    const stopped = requests.items.length;
    throw new AscNotFoundError(
      `App ${selector.appId} has no active ${selector.accessType} analytics report request${stopped > 0 ? ` (${String(stopped)} stopped for inactivity)` : ""}. Create one with the ensure-request verb; Apple generates the first data 1-2 days later.`,
    );
  }

  const reports = await listAnalyticsReports(client, request.id, {
    scope: "all-pages",
    name: [selector.reportName],
    ...(selector.category !== undefined && { category: [selector.category] }),
  });
  if (reports.items.length > 1) {
    const categories = reports.items
      .map((candidate) => candidate.attributes?.category ?? "?")
      .join(", ");
    // The name under-specifies rather than misses; invalid-parameter steers
    // the caller to refine the input instead of doubting the resource.
    throw new AscInvalidParameterError(
      `Report name "${selector.reportName}" matches ${String(reports.items.length)} reports (categories: ${categories}); add a category to disambiguate.`,
    );
  }
  const report = reports.items[0];
  if (report === undefined) {
    const available = await listAnalyticsReports(client, request.id, {
      scope: "all-pages",
    });
    const names = [
      ...new Set(
        available.items.flatMap((candidate) =>
          candidate.attributes?.name === undefined
            ? []
            : [candidate.attributes.name],
        ),
      ),
    ];
    throw new AscNotFoundError(
      `No report named "${selector.reportName}" exists under request ${request.id}.${
        names.length > 0
          ? ` Available reports: ${names.join("; ")}.`
          : " No reports exist yet — the first data takes 1-2 days after the report request is created."
      }`,
    );
  }

  const instances = await listAnalyticsReportInstances(client, report.id, {
    scope: "all-pages",
    ...(selector.granularity !== undefined && {
      granularity: [selector.granularity],
    }),
    ...(selector.processingDate !== undefined && {
      processingDate: [selector.processingDate],
    }),
  });
  const instance = [...instances.items].sort((a, b) =>
    (b.attributes?.processingDate ?? "").localeCompare(
      a.attributes?.processingDate ?? "",
    ),
  )[0];
  if (instance === undefined) {
    if (
      selector.granularity !== undefined ||
      selector.processingDate !== undefined
    ) {
      const all = await listAnalyticsReportInstances(client, report.id, {
        scope: "all-pages",
      });
      const coordinates = all.items
        .map(
          (candidate) =>
            `${candidate.attributes?.granularity ?? "?"} @ ${candidate.attributes?.processingDate ?? "?"}`,
        )
        .join(", ");
      throw new AscNotFoundError(
        `Report "${selector.reportName}" has no instance matching the granularity/date filters.${
          coordinates === ""
            ? " No instances exist yet."
            : ` Available instances: ${coordinates}.`
        }`,
      );
    }
    throw new AscNotFoundError(
      `Report "${selector.reportName}" has no instances yet — Apple generates the first data 1-2 days after the report request is created, then daily for ONGOING requests.`,
    );
  }

  const directory =
    options.directory ??
    defaultAnalyticsReportDirName(
      report.attributes?.name ?? selector.reportName,
      instance.attributes?.granularity ?? "UNKNOWN",
      instance.attributes?.processingDate ?? "unknown-date",
    );
  const download = await downloadAnalyticsInstance(
    client,
    instance.id,
    directory,
  );
  return { request, report, instance, ...download };
}
