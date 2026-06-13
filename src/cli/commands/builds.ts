import { defineCommand } from "citty";

import {
  addIndividualTesters,
  assignBuildToBetaGroups,
  expireBuild,
  findLatestProcessedBuild,
  getBuild,
  getBuildBetaDetail,
  listBuildIndividualTesters,
  listBuilds,
  listPreReleaseVersions,
  removeBuildFromBetaGroups,
  removeIndividualTesters,
  updateBuildBetaDetail,
} from "../../capabilities/builds.js";
import type {
  BuildAudienceType,
  BuildPlatform,
  FindLatestProcessedBuildOptions,
  GetBuildOptions,
  ListBuildsOptions,
  ListPreReleaseVersionsOptions,
} from "../../capabilities/builds.js";
import {
  getBuildBetaAppReviewSubmission,
  submitBuildForBetaReview,
} from "../../capabilities/beta-review.js";
import { getBetaGroup } from "../../capabilities/beta-groups.js";
import {
  deleteBetaBuildLocalization,
  listBetaBuildLocalizations,
} from "../../capabilities/beta-localizations.js";
import { upsertBetaBuildLocalization } from "../../workflows/beta-distribution.js";
import { cliContextOf } from "../context.js";
import { CliUsageError } from "../exit-codes.js";
import { documentEnvelope, emitResult, listEnvelope } from "../output.js";
import {
  csvList,
  readScopeArgs,
  resolvePageLimit,
  resolveReadScope,
} from "../read-scope.js";
import { parseAutoNotify } from "../testflight-flags.js";
import { forceArg, requireForce, requireIdList } from "./testflight-shared.js";

const listCommand = defineCommand({
  meta: {
    name: "list",
    description:
      "List builds, filterable by app, version, platform, processing state, expiry, or audience",
  },
  args: {
    app: {
      type: "string",
      valueHint: "appId",
      description: "Scope to one app",
    },
    "pre-release-version": {
      type: "string",
      valueHint: "id",
      description: "Scope to one pre-release (train) version id",
    },
    platform: {
      type: "string",
      valueHint: "IOS",
      description: "Filter by platform (via the related preReleaseVersion)",
    },
    "processing-state": {
      type: "string",
      valueHint: "VALID",
      description: "PROCESSING, FAILED, INVALID, or VALID",
    },
    version: {
      type: "string",
      valueHint: "1234",
      description: "Filter by build (upload) version string",
    },
    expired: {
      type: "boolean",
      description: "Only expired builds (--no-expired for unexpired)",
    },
    audience: {
      type: "string",
      valueHint: "APP_STORE_ELIGIBLE",
      description: "Filter by build audience type",
    },
    sort: {
      type: "string",
      valueHint: "-uploadedDate",
      description: "Sort key, e.g. uploadedDate, -uploadedDate, version",
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const options: ListBuildsOptions = {
      scope,
      ...(pageLimit !== undefined && { pageLimit }),
      ...(ctx.args.app !== undefined && { app: [ctx.args.app] }),
      ...(ctx.args["pre-release-version"] !== undefined && {
        preReleaseVersion: [ctx.args["pre-release-version"]],
      }),
      ...(ctx.args.platform !== undefined && {
        platform: [ctx.args.platform as BuildPlatform],
      }),
      ...(ctx.args["processing-state"] !== undefined && {
        processingState: [
          ctx.args["processing-state"] as NonNullable<
            ListBuildsOptions["processingState"]
          >[number],
        ],
      }),
      ...(ctx.args.version !== undefined && { version: [ctx.args.version] }),
      ...(ctx.args.expired !== undefined && {
        expired: [String(ctx.args.expired)],
      }),
      ...(ctx.args.audience !== undefined && {
        audienceType: [ctx.args.audience as BuildAudienceType],
      }),
      ...(csvList(ctx.args.sort) !== undefined && {
        sort: csvList(ctx.args.sort) as ListBuildsOptions["sort"],
      }),
    };
    const read = await listBuilds(await cli.client(), options);
    emitResult(cli.io, listEnvelope("builds list", read, scope));
  },
});

const getCommand = defineCommand({
  meta: {
    name: "get",
    description: "Read one build by ASC id, with optional related includes",
  },
  args: {
    buildId: {
      type: "positional",
      required: true,
      description: "The build's ASC id (from 'list')",
    },
    include: {
      type: "string",
      valueHint: "preReleaseVersion,betaGroups",
      description: "Related resources to include (comma-separated)",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const options: GetBuildOptions = {
      ...(csvList(ctx.args.include) !== undefined && {
        include: csvList(ctx.args.include) as GetBuildOptions["include"],
      }),
    };
    const document = await getBuild(
      await cli.client(),
      ctx.args.buildId,
      options,
    );
    emitResult(cli.io, documentEnvelope("builds get", document));
  },
});

const latestCommand = defineCommand({
  meta: {
    name: "latest",
    description:
      "Resolve the newest processed (VALID) build for an app (optionally by platform/audience)",
  },
  args: {
    app: {
      type: "string",
      required: true,
      valueHint: "appId",
      description: "The app's ASC id",
    },
    platform: {
      type: "string",
      valueHint: "IOS",
      description: "Restrict to one platform",
    },
    audience: {
      type: "string",
      valueHint: "APP_STORE_ELIGIBLE",
      description: "Restrict to one build audience type",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const options: FindLatestProcessedBuildOptions = {
      appId: ctx.args.app,
      ...(ctx.args.platform !== undefined && {
        platform: ctx.args.platform as BuildPlatform,
      }),
      ...(ctx.args.audience !== undefined && {
        audienceType: ctx.args.audience as BuildAudienceType,
      }),
    };
    const build = await findLatestProcessedBuild(await cli.client(), options);
    emitResult(
      cli.io,
      documentEnvelope(
        "builds latest",
        { data: build },
        { resolved: { appId: ctx.args.app, buildId: build.id } },
      ),
    );
  },
});

const expireCommand = defineCommand({
  meta: {
    name: "expire",
    description:
      "Expire a build. IRREVERSIBLE: Apple's API has no un-expire and the build leaves testing. Requires --force",
  },
  args: {
    buildId: {
      type: "positional",
      required: true,
      description: "The build's ASC id",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    requireForce(
      ctx.args.force,
      "Expiring a build (irreversible — there is no un-expire)",
    );
    const document = await expireBuild(await cli.client(), ctx.args.buildId);
    emitResult(
      cli.io,
      documentEnvelope("builds expire", document, {
        resolved: { buildId: ctx.args.buildId, expired: true },
      }),
    );
  },
});

// --- beta-detail subgroup ---

const betaDetailGetCommand = defineCommand({
  meta: {
    name: "get",
    description:
      "Read a build's buildBetaDetail (internal/external build state + autoNotify)",
  },
  args: {
    buildId: {
      type: "positional",
      required: true,
      description: "The build's ASC id",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const document = await getBuildBetaDetail(
      await cli.client(),
      ctx.args.buildId,
    );
    emitResult(
      cli.io,
      documentEnvelope("builds beta-detail get", document, {
        resolved: { buildId: ctx.args.buildId, detailId: document.data.id },
      }),
    );
  },
});

const betaDetailSetCommand = defineCommand({
  meta: {
    name: "set",
    description:
      "Set a build's autoNotifyEnabled (the only writable buildBetaDetail field)",
  },
  args: {
    buildId: {
      type: "positional",
      required: true,
      description: "The build's ASC id",
    },
    "auto-notify": {
      type: "string",
      required: true,
      valueHint: "true",
      description:
        "true or false: whether testers are auto-notified on approval",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const autoNotify = parseAutoNotify(ctx.args["auto-notify"]);
    const client = await cli.client();
    // The update takes the buildBetaDetail id, not the build id; read it first.
    const detail = await getBuildBetaDetail(client, ctx.args.buildId);
    const document = await updateBuildBetaDetail(client, detail.data.id, {
      autoNotifyEnabled: autoNotify,
    });
    emitResult(
      cli.io,
      documentEnvelope("builds beta-detail set", document, {
        resolved: { buildId: ctx.args.buildId, detailId: detail.data.id },
      }),
    );
  },
});

const betaDetailCommand = defineCommand({
  meta: {
    name: "beta-detail",
    description: "Build beta detail: get the states, set autoNotifyEnabled",
  },
  subCommands: {
    get: betaDetailGetCommand,
    set: betaDetailSetCommand,
  },
});

// --- notes subgroup (betaBuildLocalization "what to test") ---

const notesListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List a build's 'what to test' notes (per locale)",
  },
  args: {
    buildId: {
      type: "positional",
      required: true,
      description: "The build's ASC id",
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
    const read = await listBetaBuildLocalizations(await cli.client(), {
      scope,
      ...(pageLimit !== undefined && { pageLimit }),
      build: [ctx.args.buildId],
      ...(ctx.args.locale !== undefined && { locale: [ctx.args.locale] }),
    });
    emitResult(
      cli.io,
      listEnvelope("builds notes list", read, scope, {
        buildId: ctx.args.buildId,
      }),
    );
  },
});

const notesSetCommand = defineCommand({
  meta: {
    name: "set",
    description:
      "Set a build's 'what to test' note for a locale (upserts: creates the locale or patches it)",
  },
  args: {
    buildId: {
      type: "positional",
      required: true,
      description: "The build's ASC id",
    },
    locale: {
      type: "string",
      required: true,
      valueHint: "en-US",
      description: "The locale (BCP-47)",
    },
    "whats-new": {
      type: "string",
      required: true,
      valueHint: "text",
      description: "The 'what to test' text",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const result = await upsertBetaBuildLocalization(
      await cli.client(),
      ctx.args.buildId,
      ctx.args.locale,
      ctx.args["whats-new"],
    );
    emitResult(
      cli.io,
      documentEnvelope(
        "builds notes set",
        { data: result.localization },
        {
          resolved: {
            buildId: ctx.args.buildId,
            locale: ctx.args.locale,
            created: result.created,
          },
        },
      ),
    );
  },
});

const notesDeleteCommand = defineCommand({
  meta: {
    name: "delete",
    description:
      "Delete a build's 'what to test' note localization (destructive: --force)",
  },
  args: {
    localizationId: {
      type: "positional",
      required: true,
      description: "The betaBuildLocalization id (from 'list')",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    requireForce(ctx.args.force, "Deleting a build note localization");
    await deleteBetaBuildLocalization(
      await cli.client(),
      ctx.args.localizationId,
    );
    emitResult(cli.io, {
      ok: true,
      command: "builds notes delete",
      data: { id: ctx.args.localizationId, deleted: true },
    });
  },
});

const notesCommand = defineCommand({
  meta: {
    name: "notes",
    description:
      "Build 'what to test' notes (betaBuildLocalization): list/set/delete",
  },
  subCommands: {
    list: notesListCommand,
    set: notesSetCommand,
    delete: notesDeleteCommand,
  },
});

// --- review subgroup (beta app review submission) ---

const reviewStatusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Read a build's current beta app review submission status",
  },
  args: {
    buildId: {
      type: "positional",
      required: true,
      description: "The build's ASC id",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const document = await getBuildBetaAppReviewSubmission(
      await cli.client(),
      ctx.args.buildId,
    );
    emitResult(
      cli.io,
      documentEnvelope("builds review status", document, {
        resolved: { buildId: ctx.args.buildId },
      }),
    );
  },
});

const reviewSubmitCommand = defineCommand({
  meta: {
    name: "submit",
    description:
      "Submit a build for TestFlight external beta review. HIGH SIDE EFFECT: triggers a REAL Apple beta review; the submission cannot be patched or deleted. Requires --force",
  },
  args: {
    buildId: {
      type: "positional",
      required: true,
      description: "The build's ASC id",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    requireForce(
      ctx.args.force,
      "Submitting a build for beta review (it triggers a real Apple review and cannot be undone)",
    );
    const document = await submitBuildForBetaReview(
      await cli.client(),
      ctx.args.buildId,
    );
    emitResult(
      cli.io,
      documentEnvelope("builds review submit", document, {
        resolved: { buildId: ctx.args.buildId, submitted: true },
      }),
    );
  },
});

const reviewCommand = defineCommand({
  meta: {
    name: "review",
    description: "Beta app review: read status, submit (high side effect)",
  },
  subCommands: {
    status: reviewStatusCommand,
    submit: reviewSubmitCommand,
  },
});

// --- groups subgroup (build distribution to beta groups) ---

const groupsAddCommand = defineCommand({
  meta: {
    name: "add",
    description:
      "Distribute a build to beta groups. SIDE EFFECT: adding an external group makes the build visible to external testers (may require prior beta review). Requires --force",
  },
  args: {
    buildId: {
      type: "positional",
      required: true,
      description: "The build's ASC id",
    },
    group: {
      type: "string",
      required: true,
      valueHint: "id,id",
      description: "Beta group id(s) to distribute to",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    requireForce(
      ctx.args.force,
      "Distributing a build to beta groups (external groups expose it to testers)",
    );
    const groupIds = requireIdList(ctx.args.group, "--group");
    const client = await cli.client();
    // A group with hasAccessToAllBuilds already sees every build, so an explicit
    // build↔group linkage is redundant and Apple rejects it. Pre-check locally
    // and fail with a clear hint (exit 64) BEFORE the doomed relationship POST
    // (m7-testflight.md:59). The read is narrowed to the one needed field.
    const allBuildsGroups: string[] = [];
    for (const groupId of groupIds) {
      const group = await getBetaGroup(client, groupId, {
        fields: ["hasAccessToAllBuilds"],
      });
      if (group.data.attributes?.hasAccessToAllBuilds === true) {
        allBuildsGroups.push(groupId);
      }
    }
    if (allBuildsGroups.length > 0) {
      throw new CliUsageError(
        `Group(s) ${allBuildsGroups.join(", ")} have hasAccessToAllBuilds=true: they already see every build, so an explicit build linkage is redundant and Apple rejects it. Drop these group id(s) from --group.`,
      );
    }
    await assignBuildToBetaGroups(client, ctx.args.buildId, groupIds);
    emitResult(cli.io, {
      ok: true,
      command: "builds groups add",
      data: {
        buildId: ctx.args.buildId,
        added: groupIds,
        count: groupIds.length,
      },
    });
  },
});

const groupsRemoveCommand = defineCommand({
  meta: {
    name: "remove",
    description:
      "Stop distributing a build to beta groups (destructive: --force)",
  },
  args: {
    buildId: {
      type: "positional",
      required: true,
      description: "The build's ASC id",
    },
    group: {
      type: "string",
      required: true,
      valueHint: "id,id",
      description: "Beta group id(s) to remove",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    requireForce(ctx.args.force, "Removing a build from beta groups");
    const groupIds = requireIdList(ctx.args.group, "--group");
    await removeBuildFromBetaGroups(
      await cli.client(),
      ctx.args.buildId,
      groupIds,
    );
    emitResult(cli.io, {
      ok: true,
      command: "builds groups remove",
      data: {
        buildId: ctx.args.buildId,
        removed: groupIds,
        count: groupIds.length,
      },
    });
  },
});

const groupsCommand = defineCommand({
  meta: {
    name: "groups",
    description: "Build distribution to beta groups: add (side effect), remove",
  },
  subCommands: {
    add: groupsAddCommand,
    remove: groupsRemoveCommand,
  },
});

// --- testers subgroup (individual per-build testers) ---

const testersListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List a build's individual (per-build) testers",
  },
  args: {
    buildId: {
      type: "positional",
      required: true,
      description: "The build's ASC id",
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const read = await listBuildIndividualTesters(
      await cli.client(),
      ctx.args.buildId,
      { scope, ...(pageLimit !== undefined && { pageLimit }) },
    );
    emitResult(
      cli.io,
      listEnvelope("builds testers list", read, scope, {
        buildId: ctx.args.buildId,
      }),
    );
  },
});

const testersAddCommand = defineCommand({
  meta: {
    name: "add",
    description:
      "Add individual testers to a build. SIDE EFFECT: may notify the testers. Requires --force",
  },
  args: {
    buildId: {
      type: "positional",
      required: true,
      description: "The build's ASC id",
    },
    tester: {
      type: "string",
      required: true,
      valueHint: "id,id",
      description: "Tester id(s) to add",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    // live-verify (实机核实 #7): whether adding an individual tester notifies is
    // unconfirmed; gate it as potentially notifying.
    requireForce(
      ctx.args.force,
      "Adding individual testers to a build (it may notify them)",
    );
    const testerIds = requireIdList(ctx.args.tester, "--tester");
    await addIndividualTesters(await cli.client(), ctx.args.buildId, testerIds);
    emitResult(cli.io, {
      ok: true,
      command: "builds testers add",
      data: {
        buildId: ctx.args.buildId,
        added: testerIds,
        count: testerIds.length,
      },
    });
  },
});

const testersRemoveCommand = defineCommand({
  meta: {
    name: "remove",
    description:
      "Remove individual testers from a build (destructive: --force)",
  },
  args: {
    buildId: {
      type: "positional",
      required: true,
      description: "The build's ASC id",
    },
    tester: {
      type: "string",
      required: true,
      valueHint: "id,id",
      description: "Tester id(s) to remove",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    requireForce(ctx.args.force, "Removing individual testers from a build");
    const testerIds = requireIdList(ctx.args.tester, "--tester");
    await removeIndividualTesters(
      await cli.client(),
      ctx.args.buildId,
      testerIds,
    );
    emitResult(cli.io, {
      ok: true,
      command: "builds testers remove",
      data: {
        buildId: ctx.args.buildId,
        removed: testerIds,
        count: testerIds.length,
      },
    });
  },
});

const testersCommand = defineCommand({
  meta: {
    name: "testers",
    description: "Build individual testers: list/add (side effect)/remove",
  },
  subCommands: {
    list: testersListCommand,
    add: testersAddCommand,
    remove: testersRemoveCommand,
  },
});

// --- pre-release-versions subcommand ---

const preReleaseVersionsListCommand = defineCommand({
  meta: {
    name: "list",
    description:
      "List pre-release (train) versions, filterable by app/platform/version",
  },
  args: {
    app: {
      type: "string",
      valueHint: "appId",
      description: "Scope to one app",
    },
    platform: {
      type: "string",
      valueHint: "IOS",
      description: "Filter by platform",
    },
    version: {
      type: "string",
      valueHint: "1.2.0",
      description: "Filter by version string",
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const options: ListPreReleaseVersionsOptions = {
      scope,
      ...(pageLimit !== undefined && { pageLimit }),
      ...(ctx.args.app !== undefined && { app: [ctx.args.app] }),
      ...(ctx.args.platform !== undefined && {
        platform: [
          ctx.args.platform as NonNullable<
            ListPreReleaseVersionsOptions["platform"]
          >[number],
        ],
      }),
      ...(ctx.args.version !== undefined && { version: [ctx.args.version] }),
    };
    const read = await listPreReleaseVersions(await cli.client(), options);
    emitResult(
      cli.io,
      listEnvelope("builds pre-release-versions list", read, scope),
    );
  },
});

const preReleaseVersionsCommand = defineCommand({
  meta: {
    name: "pre-release-versions",
    description: "Pre-release (train) versions: list",
  },
  subCommands: {
    list: preReleaseVersionsListCommand,
  },
});

export const buildsCommand = defineCommand({
  meta: {
    name: "builds",
    description:
      "Builds: list/get/latest/expire, beta detail, notes, beta review, group distribution, individual testers, pre-release versions",
  },
  subCommands: {
    list: listCommand,
    get: getCommand,
    latest: latestCommand,
    expire: expireCommand,
    "beta-detail": betaDetailCommand,
    notes: notesCommand,
    review: reviewCommand,
    groups: groupsCommand,
    testers: testersCommand,
    "pre-release-versions": preReleaseVersionsCommand,
  },
});
