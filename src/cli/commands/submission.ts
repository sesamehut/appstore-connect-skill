// The `submission` top-level domain: the read-only submission-readiness
// preflight, App Store review detail (find-or-create), release configuration,
// the export-compliance boolean, the read-only status views, and the three
// high-side-effect verbs (submit / cancel / release). It models the modern
// reviewSubmissions + appStoreVersionReleaseRequests flow; the deprecated
// appStoreVersionSubmissions resource is never created or read here.

import { defineCommand } from "citty";

import {
  createAppStoreReviewDetail,
  findAppStoreReviewDetail,
  getAppStoreReviewDetail,
  updateAppStoreReviewDetail,
} from "../../capabilities/app-store-review-details.js";
import type { AppStoreReviewDetailUpdateAttributes } from "../../capabilities/app-store-review-details.js";
import { updateAppStoreVersionRelease } from "../../capabilities/app-store-versions-release.js";
import type { AppStoreVersionReleaseConfig } from "../../capabilities/app-store-versions-release.js";
import { setBuildExportCompliance } from "../../capabilities/export-compliance.js";
import { preflightVersionSubmission } from "../../workflows/submission-preflight.js";
import { cliContextOf } from "../context.js";
import { CliUsageError } from "../exit-codes.js";
import { documentEnvelope, emitResult } from "../output.js";
import { redactReviewDetailSecrets } from "../review-detail-redaction.js";
import {
  submissionCancelCommand,
  submissionReleaseCommand,
  submissionSubmitCommand,
} from "./submission-release.js";
import {
  parseExplicitBoolean,
  parseIsoDateTime,
  parseReleaseType,
  resolveAppId,
} from "./submission-shared.js";
import { submissionStatusCommand } from "./submission-status.js";

// --- preflight (read-only readiness) ---

const preflightCommand = defineCommand({
  meta: {
    name: "preflight",
    description:
      "Read-only submission-readiness check for a version: aggregates blockers (missing build/review-detail/age-rating, export compliance, editability, localizations)",
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
        "The app's ASC id (needed for the age-rating check; resolved from the version when omitted)",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const appId = await resolveAppId(cli, ctx.args.version, ctx.args.app);
    const result = await preflightVersionSubmission(
      await cli.client(),
      appId,
      ctx.args.version,
    );
    emitResult(cli.io, {
      ok: true,
      command: "submission preflight",
      data: {
        submittable: result.submittable,
        blockers: result.blockers,
        snapshot: result.snapshot,
      },
      resolved: { appId, versionId: ctx.args.version },
    });
  },
});

// --- review-detail (per-version find-or-create) ---

const reviewDetailGetCommand = defineCommand({
  meta: {
    name: "get",
    description:
      "Read a version's App Store review detail (contact + demo account + notes)",
  },
  args: {
    version: {
      type: "string",
      required: true,
      valueHint: "versionId",
      description: "The App Store version's ASC id",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const detail = await getAppStoreReviewDetail(
      await cli.client(),
      ctx.args.version,
    );
    emitResult(
      cli.io,
      documentEnvelope(
        "submission review-detail get",
        { data: redactReviewDetailSecrets(detail) },
        { resolved: { versionId: ctx.args.version, detailId: detail.id } },
      ),
    );
  },
});

const reviewDetailSetCommand = defineCommand({
  meta: {
    name: "set",
    description:
      "Set a version's App Store review detail (find-or-create by version): contact + demo account + notes",
  },
  args: {
    version: {
      type: "string",
      required: true,
      valueHint: "versionId",
      description: "The App Store version's ASC id (the lookup key)",
    },
    "contact-email": { type: "string", description: "Review contact email" },
    "contact-first-name": {
      type: "string",
      description: "Review contact first name",
    },
    "contact-last-name": {
      type: "string",
      description: "Review contact last name",
    },
    "contact-phone": { type: "string", description: "Review contact phone" },
    "demo-account-name": {
      type: "string",
      description: "Demo account username for the reviewer",
    },
    "demo-account-password": {
      type: "string",
      description: "Demo account password for the reviewer",
    },
    "demo-account-required": {
      type: "string",
      valueHint: "true",
      description: "Whether a demo account is required (true/false)",
    },
    notes: { type: "string", description: "Notes for the reviewer" },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const attributes: AppStoreReviewDetailUpdateAttributes = {
      ...(ctx.args["contact-email"] !== undefined && {
        contactEmail: ctx.args["contact-email"],
      }),
      ...(ctx.args["contact-first-name"] !== undefined && {
        contactFirstName: ctx.args["contact-first-name"],
      }),
      ...(ctx.args["contact-last-name"] !== undefined && {
        contactLastName: ctx.args["contact-last-name"],
      }),
      ...(ctx.args["contact-phone"] !== undefined && {
        contactPhone: ctx.args["contact-phone"],
      }),
      ...(ctx.args["demo-account-name"] !== undefined && {
        demoAccountName: ctx.args["demo-account-name"],
      }),
      ...(ctx.args["demo-account-password"] !== undefined && {
        demoAccountPassword: ctx.args["demo-account-password"],
      }),
      ...(ctx.args["demo-account-required"] !== undefined && {
        demoAccountRequired: parseExplicitBoolean(
          ctx.args["demo-account-required"],
          "--demo-account-required",
        ),
      }),
      ...(ctx.args.notes !== undefined && { notes: ctx.args.notes }),
    };
    if (Object.keys(attributes).length === 0) {
      throw new CliUsageError(
        "review-detail set needs at least one field (--contact-*/--demo-account-*/--notes).",
      );
    }
    const client = await cli.client();
    // Find-or-create keyed on the version: read the existing detail (if any),
    // PATCH it by its own id when present, else POST a fresh one carrying the
    // version relationship. No TOCTOU guard (single-writer expectation).
    const existing = await findAppStoreReviewDetail(client, ctx.args.version);
    if (existing !== undefined) {
      const document = await updateAppStoreReviewDetail(
        client,
        existing.id,
        attributes,
      );
      emitResult(
        cli.io,
        documentEnvelope(
          "submission review-detail set",
          { ...document, data: redactReviewDetailSecrets(document.data) },
          {
            resolved: {
              versionId: ctx.args.version,
              detailId: existing.id,
              created: false,
            },
          },
        ),
      );
      return;
    }
    const document = await createAppStoreReviewDetail(
      client,
      ctx.args.version,
      attributes,
    );
    emitResult(
      cli.io,
      documentEnvelope(
        "submission review-detail set",
        { ...document, data: redactReviewDetailSecrets(document.data) },
        {
          resolved: {
            versionId: ctx.args.version,
            detailId: document.data.id,
            created: true,
          },
        },
      ),
    );
  },
});

const reviewDetailCommand = defineCommand({
  meta: {
    name: "review-detail",
    description:
      "App Store review detail (contact + demo account + notes), per version: get/set",
  },
  subCommands: {
    get: reviewDetailGetCommand,
    set: reviewDetailSetCommand,
  },
});

// --- release-config (low side-effect version PATCH) ---

const releaseConfigSetCommand = defineCommand({
  meta: {
    name: "set",
    description:
      "Configure a version's release timing and attached build (releaseType / earliest date / downloadable / build)",
  },
  args: {
    version: {
      type: "string",
      required: true,
      valueHint: "versionId",
      description: "The App Store version's ASC id",
    },
    "release-type": {
      type: "string",
      valueHint: "MANUAL",
      description: "MANUAL | AFTER_APPROVAL | SCHEDULED",
    },
    "earliest-release-date": {
      type: "string",
      valueHint: "2026-07-01T12:00:00-07:00",
      description: "ISO date-time; only meaningful with SCHEDULED",
    },
    downloadable: {
      type: "string",
      valueHint: "true",
      description: "Whether the version is downloadable (true/false)",
    },
    build: {
      type: "string",
      valueHint: "buildId",
      description:
        "Build id to attach/swap (the version-side build relationship)",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const config: AppStoreVersionReleaseConfig = {
      ...(ctx.args["release-type"] !== undefined && {
        releaseType: parseReleaseType(ctx.args["release-type"]),
      }),
      ...(ctx.args["earliest-release-date"] !== undefined && {
        earliestReleaseDate: parseIsoDateTime(
          ctx.args["earliest-release-date"],
          "--earliest-release-date",
        ),
      }),
      ...(ctx.args.downloadable !== undefined && {
        downloadable: parseExplicitBoolean(
          ctx.args.downloadable,
          "--downloadable",
        ),
      }),
      ...(ctx.args.build !== undefined && { buildId: ctx.args.build }),
    };
    if (Object.keys(config).length === 0) {
      throw new CliUsageError(
        "release-config set needs at least one field (--release-type/--earliest-release-date/--downloadable/--build).",
      );
    }
    const document = await updateAppStoreVersionRelease(
      await cli.client(),
      ctx.args.version,
      config,
    );
    emitResult(
      cli.io,
      documentEnvelope("submission release-config set", document, {
        resolved: { versionId: ctx.args.version },
      }),
    );
  },
});

const releaseConfigCommand = defineCommand({
  meta: {
    name: "release-config",
    description:
      "Version release timing + build configuration (low side-effect): set",
  },
  subCommands: {
    set: releaseConfigSetCommand,
  },
});

// --- export-compliance (low side-effect build boolean) ---

const exportComplianceSetCommand = defineCommand({
  meta: {
    name: "set",
    description:
      "Set a build's export-compliance encryption flag (usesNonExemptEncryption)",
  },
  args: {
    build: {
      type: "string",
      required: true,
      valueHint: "buildId",
      description: "The build's ASC id (from 'builds list')",
    },
    "uses-non-exempt-encryption": {
      type: "string",
      required: true,
      valueHint: "false",
      description: "Whether the build uses non-exempt encryption (true/false)",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const usesNonExemptEncryption = parseExplicitBoolean(
      ctx.args["uses-non-exempt-encryption"],
      "--uses-non-exempt-encryption",
    );
    const document = await setBuildExportCompliance(
      await cli.client(),
      ctx.args.build,
      usesNonExemptEncryption,
    );
    emitResult(
      cli.io,
      documentEnvelope("submission export-compliance set", document, {
        resolved: { buildId: ctx.args.build, usesNonExemptEncryption },
      }),
    );
  },
});

const exportComplianceCommand = defineCommand({
  meta: {
    name: "export-compliance",
    description:
      "Build export-compliance encryption flag (low side-effect): set",
  },
  subCommands: {
    set: exportComplianceSetCommand,
  },
});

export const submissionCommand = defineCommand({
  meta: {
    name: "submission",
    description:
      "App Store submission and release: preflight, status, review-detail, release-config, export-compliance, submit/cancel/release (high side effect)",
  },
  subCommands: {
    preflight: preflightCommand,
    status: submissionStatusCommand,
    "review-detail": reviewDetailCommand,
    "release-config": releaseConfigCommand,
    "export-compliance": exportComplianceCommand,
    submit: submissionSubmitCommand,
    cancel: submissionCancelCommand,
    release: submissionReleaseCommand,
  },
});
