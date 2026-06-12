import { defineCommand } from "citty";

import { listAnalyticsReportRequests } from "../../capabilities/analytics-reports.js";
import { ensureAnalyticsReportRequest } from "../../workflows/analytics-reports.js";
import { deleteAnalyticsReportRequest } from "../../capabilities/analytics-reports.js";
import { cliContextOf } from "../context.js";
import { documentEnvelope, emitResult, listEnvelope } from "../output.js";
import {
  readScopeArgs,
  resolvePageLimit,
  resolveReadScope,
} from "../read-scope.js";
import { resolveAccessType } from "../report-flags.js";

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
  },
});
