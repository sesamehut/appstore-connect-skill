// The `submission status` leaf: read-only views of the modern reviewSubmissions
// container. `status` (default) lists an app's submissions (filter[app] is
// non-optional in the contract, so --app is required); `status get` reads one
// submission by id with optional includes. Items are read through the parent
// container, never the deprecated appStoreVersionSubmissions resource.

import { defineCommand } from "citty";

import {
  getReviewSubmission,
  listReviewSubmissions,
} from "../../capabilities/review-submissions.js";
import type {
  GetReviewSubmissionOptions,
  ListReviewSubmissionsOptions,
} from "../../capabilities/review-submissions.js";
import { cliContextOf } from "../context.js";
import { documentEnvelope, emitResult, listEnvelope } from "../output.js";
import {
  csvList,
  readScopeArgs,
  resolvePageLimit,
  resolveReadScope,
} from "../read-scope.js";

const statusListCommand = defineCommand({
  meta: {
    name: "list",
    description:
      "List an app's App Store review submissions (filter by state/platform)",
  },
  args: {
    app: {
      type: "string",
      required: true,
      valueHint: "appId",
      description: "The app's ASC id (the only lookup key; required by Apple)",
    },
    state: {
      type: "string",
      valueHint: "READY_FOR_REVIEW",
      description: "Filter by submission state",
    },
    platform: {
      type: "string",
      valueHint: "IOS",
      description: "Filter by platform",
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const options: ListReviewSubmissionsOptions = {
      appId: ctx.args.app,
      scope,
      ...(pageLimit !== undefined && { pageLimit }),
      ...(ctx.args.state !== undefined && {
        state: [
          ctx.args.state as NonNullable<
            ListReviewSubmissionsOptions["state"]
          >[number],
        ],
      }),
      ...(ctx.args.platform !== undefined && {
        platform: [
          ctx.args.platform as NonNullable<
            ListReviewSubmissionsOptions["platform"]
          >[number],
        ],
      }),
    };
    const read = await listReviewSubmissions(await cli.client(), options);
    emitResult(
      cli.io,
      listEnvelope("submission status list", read, scope, {
        appId: ctx.args.app,
      }),
    );
  },
});

const statusGetCommand = defineCommand({
  meta: {
    name: "get",
    description: "Read one App Store review submission by id, with includes",
  },
  args: {
    submissionId: {
      type: "positional",
      required: true,
      description: "The reviewSubmission's ASC id (from 'status list')",
    },
    include: {
      type: "string",
      valueHint: "app,items,appStoreVersionForReview",
      description: "Related resources to include (comma-separated)",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const options: GetReviewSubmissionOptions = {
      ...(csvList(ctx.args.include) !== undefined && {
        include: csvList(
          ctx.args.include,
        ) as GetReviewSubmissionOptions["include"],
      }),
    };
    const document = await getReviewSubmission(
      await cli.client(),
      ctx.args.submissionId,
      options,
    );
    emitResult(
      cli.io,
      documentEnvelope("submission status get", document, {
        resolved: { submissionId: ctx.args.submissionId },
      }),
    );
  },
});

/**
 * The status group exposes `list` and `get` as explicit subcommands. citty does
 * NOT route a bare `status --app X` to `list`: it exits 64 with "Unknown
 * command". Callers must spell the subcommand — `status list --app X` /
 * `status get <id>` — which is exactly what SKILL.md documents.
 */
export const submissionStatusCommand = defineCommand({
  meta: {
    name: "status",
    description:
      "App Store review submission status (read-only): list (by app), get (by id)",
  },
  subCommands: {
    list: statusListCommand,
    get: statusGetCommand,
  },
});
