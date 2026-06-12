import { defineCommand } from "citty";

import {
  deleteAnalyticsReportRequest,
  listAnalyticsReportInstances,
  listAnalyticsReportRequests,
  listAnalyticsReports,
  listAnalyticsReportSegments,
} from "../../capabilities/analytics-reports.js";
import type {
  AnalyticsReportCategory,
  AnalyticsReportGranularity,
} from "../../capabilities/analytics-reports.js";
import {
  downloadAnalyticsInstance,
  downloadAnalyticsReport,
  ensureAnalyticsReportRequest,
} from "../../workflows/analytics-reports.js";
import type { DownloadedAnalyticsSegment } from "../../workflows/analytics-reports.js";
import {
  convertDelimitedReportToJson,
  jsonSiblingPath,
} from "../../workflows/report-files.js";
import { cliContextOf } from "../context.js";
import { CliUsageError } from "../exit-codes.js";
import { documentEnvelope, emitResult, listEnvelope } from "../output.js";
import {
  readScopeArgs,
  resolvePageLimit,
  resolveReadScope,
} from "../read-scope.js";
import {
  resolveAccessType,
  resolveReportFormat,
  validateProcessingDate,
} from "../report-flags.js";

const ensureRequestCommand = defineCommand({
  meta: {
    name: "ensure-request",
    description:
      "Create the app's analytics report request, or reuse the active one (idempotent; first data takes 1-2 days)",
  },
  args: {
    app: {
      type: "string",
      required: true,
      valueHint: "appId",
      description: "The app's ASC id (from 'asc apps list')",
    },
    "access-type": {
      type: "string",
      valueHint: "ONGOING",
      description:
        "ONGOING (default; continuously generated reports) or ONE_TIME_SNAPSHOT (historical backfill)",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const accessType = resolveAccessType(ctx.args["access-type"]);
    const result = await ensureAnalyticsReportRequest(
      await cli.client(),
      ctx.args.app,
      accessType,
    );
    const rateLimit = cli.lastRateLimit();
    emitResult(
      cli.io,
      documentEnvelope(
        "reports analytics ensure-request",
        { data: result.request },
        {
          resolved: {
            created: result.created,
            ...(result.stoppedRequestIds.length > 0 && {
              stoppedRequestIds: result.stoppedRequestIds,
            }),
          },
          ...(rateLimit !== undefined && { rateLimit }),
        },
      ),
    );
  },
});

const listRequestsCommand = defineCommand({
  meta: {
    name: "list-requests",
    description:
      "List the app's analytics report requests (check stoppedDueToInactivity here)",
  },
  args: {
    app: {
      type: "string",
      required: true,
      valueHint: "appId",
      description: "The app's ASC id",
    },
    "access-type": {
      type: "string",
      valueHint: "ONGOING",
      description: "Filter by access type: ONGOING or ONE_TIME_SNAPSHOT",
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const rawAccessType = ctx.args["access-type"];
    const read = await listAnalyticsReportRequests(
      await cli.client(),
      ctx.args.app,
      {
        scope,
        ...(pageLimit !== undefined && { pageLimit }),
        ...(rawAccessType !== undefined && {
          accessType: [resolveAccessType(rawAccessType)],
        }),
      },
    );
    emitResult(
      cli.io,
      listEnvelope("reports analytics list-requests", read, scope),
    );
  },
});

const deleteRequestCommand = defineCommand({
  meta: {
    name: "delete-request",
    description:
      "Delete an analytics report request (destructive: discards its accumulated reports; a replacement waits 1-2 days for first data)",
  },
  args: {
    requestId: {
      type: "positional",
      required: true,
      description: "The report request's ASC id (from 'list-requests')",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    await deleteAnalyticsReportRequest(await cli.client(), ctx.args.requestId);
    emitResult(cli.io, {
      ok: true,
      command: "reports analytics delete-request",
      data: { id: ctx.args.requestId, deleted: true },
    });
  },
});

const listReportsCommand = defineCommand({
  meta: {
    name: "list-reports",
    description:
      "List the reports Apple generates under a report request (names feed 'download')",
  },
  args: {
    request: {
      type: "string",
      required: true,
      valueHint: "requestId",
      description: "The report request's ASC id (from 'ensure-request')",
    },
    category: {
      type: "string",
      valueHint: "APP_USAGE",
      description:
        "Filter by category: APP_USAGE, APP_STORE_ENGAGEMENT, COMMERCE, FRAMEWORK_USAGE, PERFORMANCE",
    },
    name: {
      type: "string",
      valueHint: "name",
      description: 'Filter by exact report name, e.g. "App Downloads Standard"',
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const read = await listAnalyticsReports(
      await cli.client(),
      ctx.args.request,
      {
        scope,
        ...(pageLimit !== undefined && { pageLimit }),
        // Enum values pass through for ASC to validate: a stale local list
        // would reject categories Apple has since added.
        ...(ctx.args.category !== undefined && {
          category: [ctx.args.category as AnalyticsReportCategory],
        }),
        ...(ctx.args.name !== undefined && { name: [ctx.args.name] }),
      },
    );
    emitResult(
      cli.io,
      listEnvelope("reports analytics list-reports", read, scope),
    );
  },
});

const listInstancesCommand = defineCommand({
  meta: {
    name: "list-instances",
    description: "List a report's dated instances (ids feed 'list-segments')",
  },
  args: {
    report: {
      type: "string",
      required: true,
      valueHint: "reportId",
      description: "The report's ASC id (from 'list-reports')",
    },
    granularity: {
      type: "string",
      valueHint: "DAILY",
      description: "Filter by granularity: DAILY, WEEKLY, or MONTHLY",
    },
    date: {
      type: "string",
      valueHint: "2026-06-10",
      description: "Filter by processing date (YYYY-MM-DD)",
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    validateProcessingDate(ctx.args.date);
    const read = await listAnalyticsReportInstances(
      await cli.client(),
      ctx.args.report,
      {
        scope,
        ...(pageLimit !== undefined && { pageLimit }),
        ...(ctx.args.granularity !== undefined && {
          granularity: [ctx.args.granularity as AnalyticsReportGranularity],
        }),
        ...(ctx.args.date !== undefined && {
          processingDate: [ctx.args.date],
        }),
      },
    );
    emitResult(
      cli.io,
      listEnvelope("reports analytics list-instances", read, scope),
    );
  },
});

const listSegmentsCommand = defineCommand({
  meta: {
    name: "list-segments",
    description:
      "List an instance's downloadable segments (URLs are short-lived)",
  },
  args: {
    instance: {
      type: "string",
      required: true,
      valueHint: "instanceId",
      description: "The report instance's ASC id (from 'list-instances')",
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const read = await listAnalyticsReportSegments(
      await cli.client(),
      ctx.args.instance,
      { scope, ...(pageLimit !== undefined && { pageLimit }) },
    );
    emitResult(
      cli.io,
      listEnvelope("reports analytics list-segments", read, scope),
    );
  },
});

async function withJsonConversion(
  segments: readonly DownloadedAnalyticsSegment[],
  format: "json" | undefined,
): Promise<
  readonly (DownloadedAnalyticsSegment & {
    readonly convertedJsonPath?: string;
  })[]
> {
  if (format === undefined) {
    return segments;
  }
  const converted = [];
  for (const segment of segments) {
    const json = await convertDelimitedReportToJson(
      segment.path,
      jsonSiblingPath(segment.path),
    );
    converted.push({ ...segment, convertedJsonPath: json.path });
  }
  return converted;
}

const SELECTOR_FLAGS = [
  "app",
  "name",
  "access-type",
  "category",
  "granularity",
  "date",
] as const;

const downloadCommand = defineCommand({
  meta: {
    name: "download",
    description:
      "One-shot download: resolve request → report → instance and fetch every segment to a directory",
  },
  args: {
    app: {
      type: "string",
      valueHint: "appId",
      description: "The app's ASC id (selector mode, with --name)",
    },
    name: {
      type: "string",
      valueHint: "name",
      description:
        'Exact report name, e.g. "App Downloads Standard" (see list-reports)',
    },
    "access-type": {
      type: "string",
      valueHint: "ONGOING",
      description: "Report request access type (default ONGOING)",
    },
    category: {
      type: "string",
      valueHint: "APP_USAGE",
      description: "Disambiguates when one name matches several categories",
    },
    granularity: {
      type: "string",
      valueHint: "DAILY",
      description: "Instance granularity: DAILY, WEEKLY, or MONTHLY",
    },
    date: {
      type: "string",
      valueHint: "2026-06-10",
      description:
        "Instance processing date (YYYY-MM-DD); omit for the latest instance",
    },
    instance: {
      type: "string",
      valueHint: "instanceId",
      description:
        "Download a known instance directly, skipping the selector chain",
    },
    "output-dir": {
      type: "string",
      valueHint: "dir",
      description:
        "Destination directory (default: analytics-<report>-<granularity>-<date> in the current directory)",
    },
    format: {
      type: "string",
      valueHint: "json",
      description:
        "Additionally convert each segment to a JSON file next to it",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const format = resolveReportFormat(ctx.args.format);
    const instanceId = ctx.args.instance;

    if (instanceId !== undefined) {
      const conflicting = SELECTOR_FLAGS.filter(
        (flag) => ctx.args[flag] !== undefined,
      );
      if (conflicting.length > 0) {
        throw new CliUsageError(
          `--instance addresses one instance directly; drop --${conflicting.join(", --")} (they belong to the selector mode).`,
        );
      }
      const directory =
        ctx.args["output-dir"] ?? `analytics-instance-${instanceId}`;
      const result = await downloadAnalyticsInstance(
        await cli.client(),
        instanceId,
        directory,
      );
      const rateLimit = cli.lastRateLimit();
      emitResult(cli.io, {
        ok: true,
        command: "reports analytics download",
        data: {
          directory: result.directory,
          segments: await withJsonConversion(result.segments, format),
        },
        resolved: { instanceId },
        ...(rateLimit !== undefined && { rateLimit }),
      });
      return;
    }

    if (ctx.args.app === undefined || ctx.args.name === undefined) {
      throw new CliUsageError(
        "Provide --app and --name to locate the report, or --instance to download a known instance directly.",
      );
    }
    validateProcessingDate(ctx.args.date);
    const selector = {
      appId: ctx.args.app,
      accessType: resolveAccessType(ctx.args["access-type"]),
      reportName: ctx.args.name,
      ...(ctx.args.category !== undefined && {
        category: ctx.args.category as AnalyticsReportCategory,
      }),
      ...(ctx.args.granularity !== undefined && {
        granularity: ctx.args.granularity as AnalyticsReportGranularity,
      }),
      ...(ctx.args.date !== undefined && { processingDate: ctx.args.date }),
    };
    const result = await downloadAnalyticsReport(await cli.client(), selector, {
      ...(ctx.args["output-dir"] !== undefined && {
        directory: ctx.args["output-dir"],
      }),
    });
    const rateLimit = cli.lastRateLimit();
    emitResult(cli.io, {
      ok: true,
      command: "reports analytics download",
      data: {
        directory: result.directory,
        segments: await withJsonConversion(result.segments, format),
      },
      // The chain the CLI walked on the caller's behalf; segment URLs are
      // short-lived signed addresses and stay out of the envelope.
      resolved: {
        requestId: result.request.id,
        accessType: selector.accessType,
        reportId: result.report.id,
        reportName: result.report.attributes?.name,
        category: result.report.attributes?.category,
        instanceId: result.instance.id,
        granularity: result.instance.attributes?.granularity,
        processingDate: result.instance.attributes?.processingDate,
      },
      ...(rateLimit !== undefined && { rateLimit }),
    });
  },
});

export const reportsAnalyticsCommand = defineCommand({
  meta: {
    name: "analytics",
    description:
      "Analytics report lifecycle: report requests, reports, instances, segment downloads",
  },
  subCommands: {
    "ensure-request": ensureRequestCommand,
    "list-requests": listRequestsCommand,
    "delete-request": deleteRequestCommand,
    "list-reports": listReportsCommand,
    "list-instances": listInstancesCommand,
    "list-segments": listSegmentsCommand,
    download: downloadCommand,
  },
});
