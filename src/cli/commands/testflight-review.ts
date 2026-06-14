// Two related leaf trees that both live behind the testflight group:
//   test-info     — betaAppLocalization (app-level TestFlight metadata per locale)
//   review-detail — betaAppReviewDetail (the contact/demo info Apple uses for
//                   external beta review; per-app singleton, no create/delete)
// They share this file because both are small read/upsert surfaces keyed by app.

import { defineCommand } from "citty";

import {
  deleteBetaAppLocalization,
  listBetaAppLocalizations,
} from "../../capabilities/beta-localizations.js";
import {
  getBetaAppReviewDetail,
  updateBetaAppReviewDetail,
} from "../../capabilities/beta-review.js";
import { upsertBetaAppLocalization } from "../../workflows/beta-distribution.js";
import { cliContextOf } from "../context.js";
import { CliUsageError } from "../exit-codes.js";
import { documentEnvelope, emitResult, listEnvelope } from "../output.js";
import {
  readScopeArgs,
  resolvePageLimit,
  resolveReadScope,
} from "../read-scope.js";
import { redactReviewDetailSecrets } from "../review-detail-redaction.js";
import { forceArg, requireForce } from "./testflight-shared.js";

// --- test-info (betaAppLocalization) ---

const testInfoListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List an app's TestFlight metadata localizations",
  },
  args: {
    app: {
      type: "string",
      required: true,
      valueHint: "appId",
      description: "The app's ASC id",
    },
    locale: {
      type: "string",
      valueHint: "en-US",
      description: "Filter to one locale",
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const read = await listBetaAppLocalizations(await cli.client(), {
      scope,
      ...(pageLimit !== undefined && { pageLimit }),
      app: [ctx.args.app],
      ...(ctx.args.locale !== undefined && { locale: [ctx.args.locale] }),
    });
    emitResult(
      cli.io,
      listEnvelope("testflight test-info list", read, scope, {
        appId: ctx.args.app,
      }),
    );
  },
});

const testInfoSetCommand = defineCommand({
  meta: {
    name: "set",
    description:
      "Set an app's TestFlight metadata for a locale (upserts: creates the locale or patches it)",
  },
  args: {
    app: {
      type: "string",
      required: true,
      valueHint: "appId",
      description: "The app's ASC id",
    },
    locale: {
      type: "string",
      required: true,
      valueHint: "en-US",
      description: "The locale (BCP-47)",
    },
    description: {
      type: "string",
      description: "The beta app description shown to testers",
    },
    "feedback-email": {
      type: "string",
      valueHint: "beta@x.com",
      description: "Where tester feedback is sent",
    },
    "marketing-url": {
      type: "string",
      description: "Marketing URL",
    },
    "privacy-policy-url": {
      type: "string",
      description: "Privacy policy URL",
    },
    "tvos-privacy-policy": {
      type: "string",
      description: "tvOS privacy policy text",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const attributes = {
      ...(ctx.args.description !== undefined && {
        description: ctx.args.description,
      }),
      ...(ctx.args["feedback-email"] !== undefined && {
        feedbackEmail: ctx.args["feedback-email"],
      }),
      ...(ctx.args["marketing-url"] !== undefined && {
        marketingUrl: ctx.args["marketing-url"],
      }),
      ...(ctx.args["privacy-policy-url"] !== undefined && {
        privacyPolicyUrl: ctx.args["privacy-policy-url"],
      }),
      ...(ctx.args["tvos-privacy-policy"] !== undefined && {
        tvOsPrivacyPolicy: ctx.args["tvos-privacy-policy"],
      }),
    };
    if (Object.keys(attributes).length === 0) {
      throw new CliUsageError(
        "test-info set needs at least one field (--description/--feedback-email/--marketing-url/--privacy-policy-url/--tvos-privacy-policy).",
      );
    }
    const result = await upsertBetaAppLocalization(
      await cli.client(),
      ctx.args.app,
      ctx.args.locale,
      attributes,
    );
    emitResult(
      cli.io,
      documentEnvelope(
        "testflight test-info set",
        { data: result.localization },
        {
          resolved: {
            appId: ctx.args.app,
            locale: ctx.args.locale,
            created: result.created,
          },
        },
      ),
    );
  },
});

const testInfoDeleteCommand = defineCommand({
  meta: {
    name: "delete",
    description:
      "Delete an app's TestFlight metadata localization (destructive: --force)",
  },
  args: {
    localizationId: {
      type: "positional",
      required: true,
      description: "The betaAppLocalization id (from 'list')",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    requireForce(ctx.args.force, "Deleting a TestFlight metadata localization");
    await deleteBetaAppLocalization(
      await cli.client(),
      ctx.args.localizationId,
    );
    emitResult(cli.io, {
      ok: true,
      command: "testflight test-info delete",
      data: { id: ctx.args.localizationId, deleted: true },
    });
  },
});

export const testflightTestInfoCommand = defineCommand({
  meta: {
    name: "test-info",
    description: "App-level TestFlight metadata localizations: list/set/delete",
  },
  subCommands: {
    list: testInfoListCommand,
    set: testInfoSetCommand,
    delete: testInfoDeleteCommand,
  },
});

// --- review-detail (betaAppReviewDetail) ---

const reviewDetailGetCommand = defineCommand({
  meta: {
    name: "get",
    description:
      "Read an app's beta app review detail (contact + demo account info for external beta review)",
  },
  args: {
    app: {
      type: "string",
      required: true,
      valueHint: "appId",
      description:
        "The app's ASC id (the only lookup key; not-found means none yet)",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const detail = await getBetaAppReviewDetail(await cli.client(), {
      appId: ctx.args.app,
    });
    emitResult(
      cli.io,
      documentEnvelope(
        "testflight review-detail get",
        { data: redactReviewDetailSecrets(detail) },
        { resolved: { appId: ctx.args.app, detailId: detail.id } },
      ),
    );
  },
});

const reviewDetailSetCommand = defineCommand({
  meta: {
    name: "set",
    description:
      "Update the beta app review detail by its id (contact + demo account fields)",
  },
  args: {
    detailId: {
      type: "positional",
      required: true,
      description: "The betaAppReviewDetail id (from 'get')",
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
      type: "boolean",
      description: "Whether a demo account is required to review",
    },
    notes: {
      type: "string",
      description: "Notes for the reviewer",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const attributes = {
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
        demoAccountRequired: ctx.args["demo-account-required"],
      }),
      ...(ctx.args.notes !== undefined && { notes: ctx.args.notes }),
    };
    if (Object.keys(attributes).length === 0) {
      throw new CliUsageError(
        "review-detail set needs at least one field (--contact-*/--demo-account-*/--notes).",
      );
    }
    const document = await updateBetaAppReviewDetail(
      await cli.client(),
      ctx.args.detailId,
      attributes,
    );
    emitResult(
      cli.io,
      documentEnvelope("testflight review-detail set", {
        ...document,
        data: redactReviewDetailSecrets(document.data),
      }),
    );
  },
});

export const testflightReviewDetailCommand = defineCommand({
  meta: {
    name: "review-detail",
    description:
      "Beta app review detail (contact + demo account info): get/set",
  },
  subCommands: {
    get: reviewDetailGetCommand,
    set: reviewDetailSetCommand,
  },
});
