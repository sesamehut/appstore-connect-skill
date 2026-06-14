// The three HIGH-SIDE-EFFECT submission verbs, kept together so the --force
// gating is obvious in one place: submit (starts a real App Review), cancel
// (withdraws, forcing a fresh review), and release (immediate public release).
// Each requires --force as the FIRST line of run() — a missing --force is a
// zero-network exit 64 (requireForce throws before await cli.client()). All
// three are modeled as async-accept: they emit an "accepted" envelope and do
// not assert immediate read-back. NONE is ever exercised by the smoke script.

import { defineCommand } from "citty";

import { cancelReviewSubmission } from "../../workflows/submission-assembly.js";
import {
  releaseVersionNow,
  submitVersionForReview,
} from "../../workflows/submission-assembly.js";
import { cliContextOf } from "../context.js";
import { emitResult } from "../output.js";
import { resolveAppId } from "./submission-shared.js";
import { forceArg, requireForce } from "./testflight-shared.js";

const submitCommand = defineCommand({
  meta: {
    name: "submit",
    description:
      "Submit an App Store version for review. HIGH SIDE EFFECT: starts a REAL Apple App Review on the live store listing. Requires --force",
  },
  args: {
    version: {
      type: "string",
      required: true,
      valueHint: "versionId",
      description: "The App Store version's ASC id (from 'versions list')",
    },
    app: {
      type: "string",
      valueHint: "appId",
      description:
        "The app's ASC id (the review container is app-scoped; resolved from the version when omitted)",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    // First line, before any network: a missing --force costs zero requests.
    requireForce(
      ctx.args.force,
      "Submitting a version for App Review (it starts a real Apple review and goes to the public store)",
    );
    const appId = await resolveAppId(cli, ctx.args.version, ctx.args.app);
    const result = await submitVersionForReview(
      await cli.client(),
      appId,
      ctx.args.version,
    );
    // Async-accept: submitted=true was PATCHed; the server advances state
    // asynchronously, so the envelope reports acceptance, not a final state.
    emitResult(cli.io, {
      ok: true,
      command: "submission submit",
      data: {
        submissionId: result.submission.id,
        itemId: result.item.id,
        appId,
        versionId: ctx.args.version,
        containerCreated: result.containerCreated,
        itemCreated: result.itemCreated,
        submitted: result.submitted,
        accepted: true,
      },
    });
  },
});

const cancelCommand = defineCommand({
  meta: {
    name: "cancel",
    description:
      "Cancel (withdraw) a review submission. HIGH SIDE EFFECT: the version flips to Developer Rejected and a re-submit reviews from scratch. Requires --force",
  },
  args: {
    submissionId: {
      type: "positional",
      required: true,
      description: "The reviewSubmission's ASC id (from 'status list')",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    requireForce(
      ctx.args.force,
      "Canceling a review submission (it forces a fresh review on re-submit and cannot be un-canceled)",
    );
    const result = await cancelReviewSubmission(
      await cli.client(),
      ctx.args.submissionId,
    );
    emitResult(cli.io, {
      ok: true,
      command: "submission cancel",
      data: {
        submissionId: result.submission.id,
        canceled: result.canceled,
        accepted: true,
      },
    });
  },
});

const releaseCommand = defineCommand({
  meta: {
    name: "release",
    description:
      "Release an approved version to the public now. HIGH SIDE EFFECT: immediate public release (only for a MANUAL version pending developer release); irreversible. Requires --force",
  },
  args: {
    version: {
      type: "string",
      required: true,
      valueHint: "versionId",
      description: "The approved App Store version's ASC id",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    requireForce(
      ctx.args.force,
      "Releasing a version to the public (it goes live immediately and cannot be undone)",
    );
    const result = await releaseVersionNow(
      await cli.client(),
      ctx.args.version,
    );
    emitResult(cli.io, {
      ok: true,
      command: "submission release",
      data: {
        versionId: ctx.args.version,
        releaseRequestId: result.releaseRequestId,
        accepted: result.accepted,
      },
    });
  },
});

export const submissionSubmitCommand = submitCommand;
export const submissionCancelCommand = cancelCommand;
export const submissionReleaseCommand = releaseCommand;
