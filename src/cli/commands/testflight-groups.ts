import { defineCommand } from "citty";

import {
  addTestersToGroup,
  checkRecruitmentCompatibleBuild,
  clearRecruitmentCriteria,
  createBetaGroup,
  deleteBetaGroup,
  getBetaGroup,
  listBetaGroups,
  listGroupBuilds,
  listGroupTesters,
  listRecruitmentCriterionOptions,
  readRecruitmentCriteria,
  removeTestersFromGroup,
  setPublicLink,
  setRecruitmentCriteria,
  updateBetaGroup,
} from "../../capabilities/beta-groups.js";
import type {
  GetBetaGroupOptions,
  ListBetaGroupsOptions,
} from "../../capabilities/beta-groups.js";
import { findRecruitmentCriterionId } from "../../workflows/beta-distribution.js";
import { cliContextOf } from "../context.js";
import { CliUsageError } from "../exit-codes.js";
import { documentEnvelope, emitResult, listEnvelope } from "../output.js";
import { parsePositiveInt } from "../read-scope.js";
import {
  readScopeArgs,
  resolvePageLimit,
  resolveReadScope,
} from "../read-scope.js";
import {
  parseRecruitmentFilters,
  rejectCreateOnlyGroupFlags,
} from "../testflight-flags.js";
import { forceArg, requireForce, requireIdList } from "./testflight-shared.js";

const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "List beta groups, filterable by app, name, or internal flag",
  },
  args: {
    app: {
      type: "string",
      valueHint: "appId",
      description: "Scope to one app's groups",
    },
    name: {
      type: "string",
      valueHint: "name",
      description: "Filter by exact group name",
    },
    internal: {
      type: "boolean",
      description:
        "Only internal groups (omit for all; --no-internal for external)",
    },
    sort: {
      type: "string",
      valueHint: "name",
      description: "Sort key, e.g. name, -name, createdDate, -createdDate",
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const options: ListBetaGroupsOptions = {
      scope,
      ...(pageLimit !== undefined && { pageLimit }),
      ...(ctx.args.app !== undefined && { app: [ctx.args.app] }),
      ...(ctx.args.name !== undefined && { name: [ctx.args.name] }),
      ...(ctx.args.internal !== undefined && {
        isInternalGroup: [String(ctx.args.internal)],
      }),
      ...(ctx.args.sort !== undefined && {
        sort: csvSort(ctx.args.sort) as ListBetaGroupsOptions["sort"],
      }),
    };
    const read = await listBetaGroups(await cli.client(), options);
    emitResult(cli.io, listEnvelope("testflight groups list", read, scope));
  },
});

function csvSort(raw: string): string[] {
  return raw.split(",").map((value) => value.trim());
}

const getCommand = defineCommand({
  meta: {
    name: "get",
    description: "Read one beta group, optionally including app/builds/testers",
  },
  args: {
    groupId: {
      type: "positional",
      required: true,
      description: "The beta group's ASC id (from 'list')",
    },
    include: {
      type: "string",
      valueHint: "app,builds,betaTesters",
      description: "Related resources to include (comma-separated)",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const options: GetBetaGroupOptions = {
      ...(ctx.args.include !== undefined && {
        include: csvSort(ctx.args.include) as GetBetaGroupOptions["include"],
      }),
    };
    const document = await getBetaGroup(
      await cli.client(),
      ctx.args.groupId,
      options,
    );
    emitResult(cli.io, documentEnvelope("testflight groups get", document));
  },
});

const createCommand = defineCommand({
  meta: {
    name: "create",
    description:
      "Create a beta group for an app. --internal/--all-builds are create-only. Creating with testers attached (not done here) would email invitations",
  },
  args: {
    app: {
      type: "string",
      required: true,
      valueHint: "appId",
      description: "The app to create the group under",
    },
    name: {
      type: "string",
      required: true,
      valueHint: "name",
      description: "The group's display name",
    },
    internal: {
      type: "boolean",
      description:
        "Create an internal group (create-only; cannot be changed later)",
    },
    "all-builds": {
      type: "boolean",
      description:
        "Grant access to all builds (create-only; such groups reject explicit build links)",
    },
    feedback: {
      type: "boolean",
      description: "Enable tester feedback for the group",
    },
    "public-link": {
      type: "boolean",
      description:
        "Enable the public recruitment link (external exposure of the app)",
    },
    "public-link-limit": {
      type: "string",
      valueHint: "N",
      description:
        "Cap public-link installs at N (implies the limit is enabled)",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    // Enabling a public link at create time publicly exposes the app for
    // external recruitment (no per-person email, but a real exposure); require
    // an explicit confirmation rather than letting a stray flag publish it.
    if (ctx.args["public-link"] === true) {
      requireForce(
        ctx.args.force,
        "Creating a group with the public link enabled (it exposes the app)",
      );
    }
    const limit =
      ctx.args["public-link-limit"] !== undefined
        ? parsePositiveInt(ctx.args["public-link-limit"], "--public-link-limit")
        : undefined;
    const document = await createBetaGroup(await cli.client(), ctx.args.app, {
      name: ctx.args.name,
      ...(ctx.args.internal === true && { isInternalGroup: true }),
      ...(ctx.args["all-builds"] === true && { hasAccessToAllBuilds: true }),
      ...(ctx.args.feedback !== undefined && {
        feedbackEnabled: ctx.args.feedback,
      }),
      ...(ctx.args["public-link"] !== undefined && {
        publicLinkEnabled: ctx.args["public-link"],
      }),
      ...(limit !== undefined && {
        publicLinkLimit: limit,
        publicLinkLimitEnabled: true,
      }),
    });
    emitResult(
      cli.io,
      documentEnvelope("testflight groups create", document, {
        resolved: { appId: ctx.args.app, name: ctx.args.name },
      }),
    );
  },
});

const updateCommand = defineCommand({
  meta: {
    name: "update",
    description:
      "Update a group's mutable attributes (name/feedback/public-link/silicon-mac/apple-vision). --internal and --all-builds are create-only and rejected here",
  },
  args: {
    groupId: {
      type: "positional",
      required: true,
      description: "The beta group's ASC id",
    },
    name: {
      type: "string",
      valueHint: "name",
      description: "New display name",
    },
    feedback: {
      type: "boolean",
      description:
        "Enable (--feedback) or disable (--no-feedback) tester feedback",
    },
    "public-link": {
      type: "boolean",
      description:
        "Enable (--public-link) or disable (--no-public-link) the public link (enabling exposes the app)",
    },
    "public-link-limit": {
      type: "string",
      valueHint: "N",
      description:
        "Cap public-link installs at N (implies the limit is enabled)",
    },
    "silicon-mac": {
      type: "boolean",
      description: "Whether iOS builds are available for Apple Silicon Macs",
    },
    "apple-vision": {
      type: "boolean",
      description: "Whether iOS builds are available for Apple Vision",
    },
    // Declared so a caller who passes them gets a precise rejection rather than
    // citty's generic unknown-flag error.
    internal: {
      type: "boolean",
      description: "(rejected: internal is create-only)",
    },
    "all-builds": {
      type: "boolean",
      description: "(rejected: all-builds is create-only)",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    rejectCreateOnlyGroupFlags(ctx.args);
    const limit =
      ctx.args["public-link-limit"] !== undefined
        ? parsePositiveInt(ctx.args["public-link-limit"], "--public-link-limit")
        : undefined;
    const attributes = {
      ...(ctx.args.name !== undefined && { name: ctx.args.name }),
      ...(ctx.args.feedback !== undefined && {
        feedbackEnabled: ctx.args.feedback,
      }),
      ...(ctx.args["public-link"] !== undefined && {
        publicLinkEnabled: ctx.args["public-link"],
      }),
      ...(limit !== undefined && {
        publicLinkLimit: limit,
        publicLinkLimitEnabled: true,
      }),
      ...(ctx.args["silicon-mac"] !== undefined && {
        iosBuildsAvailableForAppleSiliconMac: ctx.args["silicon-mac"],
      }),
      ...(ctx.args["apple-vision"] !== undefined && {
        iosBuildsAvailableForAppleVision: ctx.args["apple-vision"],
      }),
    };
    if (Object.keys(attributes).length === 0) {
      throw new CliUsageError(
        "update needs at least one field to change (--name/--feedback/--public-link/--public-link-limit/--silicon-mac/--apple-vision).",
      );
    }
    const document = await updateBetaGroup(
      await cli.client(),
      ctx.args.groupId,
      attributes,
    );
    emitResult(cli.io, documentEnvelope("testflight groups update", document));
  },
});

const deleteCommand = defineCommand({
  meta: {
    name: "delete",
    description:
      "Delete a beta group (destructive: --force; a non-empty group's members are read and reported first)",
  },
  args: {
    groupId: {
      type: "positional",
      required: true,
      description: "The beta group's ASC id",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    requireForce(ctx.args.force, "Deleting a beta group");
    const client = await cli.client();
    // live-verify (实机核实 #2): cascade-vs-reject for a non-empty group is
    // unconfirmed; read members first so the envelope reports what is taken.
    const members = await listGroupTesters(client, ctx.args.groupId, {
      scope: "all-pages",
    });
    await deleteBetaGroup(client, ctx.args.groupId);
    emitResult(cli.io, {
      ok: true,
      command: "testflight groups delete",
      data: {
        id: ctx.args.groupId,
        deleted: true,
        memberCount: members.items.length,
      },
    });
  },
});

const testersCommand = defineCommand({
  meta: {
    name: "testers",
    description: "List the testers in a group (the canonical membership read)",
  },
  args: {
    groupId: {
      type: "positional",
      required: true,
      description: "The beta group's ASC id",
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const read = await listGroupTesters(await cli.client(), ctx.args.groupId, {
      scope,
      ...(pageLimit !== undefined && { pageLimit }),
    });
    emitResult(
      cli.io,
      listEnvelope("testflight groups testers", read, scope, {
        groupId: ctx.args.groupId,
      }),
    );
  },
});

const addTestersCommand = defineCommand({
  meta: {
    name: "add-testers",
    description:
      "Add existing testers to a group. HIGH SIDE EFFECT: emails a real TestFlight invitation to each tester. Requires --force",
  },
  args: {
    groupId: {
      type: "positional",
      required: true,
      description: "The beta group's ASC id",
    },
    testers: {
      type: "string",
      required: true,
      valueHint: "id,id",
      description: "Tester ids to add (from 'asc testflight testers list')",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    requireForce(
      ctx.args.force,
      "Adding testers to a group (it emails real invitations)",
    );
    const testerIds = requireIdList(ctx.args.testers, "--testers");
    await addTestersToGroup(await cli.client(), ctx.args.groupId, testerIds);
    emitResult(cli.io, {
      ok: true,
      command: "testflight groups add-testers",
      data: {
        groupId: ctx.args.groupId,
        added: testerIds,
        count: testerIds.length,
      },
    });
  },
});

const removeTestersCommand = defineCommand({
  meta: {
    name: "remove-testers",
    description: "Remove testers from a group (destructive: --force)",
  },
  args: {
    groupId: {
      type: "positional",
      required: true,
      description: "The beta group's ASC id",
    },
    testers: {
      type: "string",
      required: true,
      valueHint: "id,id",
      description: "Tester ids to remove",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    requireForce(ctx.args.force, "Removing testers from a group");
    const testerIds = requireIdList(ctx.args.testers, "--testers");
    await removeTestersFromGroup(
      await cli.client(),
      ctx.args.groupId,
      testerIds,
    );
    emitResult(cli.io, {
      ok: true,
      command: "testflight groups remove-testers",
      data: {
        groupId: ctx.args.groupId,
        removed: testerIds,
        count: testerIds.length,
      },
    });
  },
});

const buildsCommand = defineCommand({
  meta: {
    name: "builds",
    description:
      "List the builds a group can test (visibility only; edit distribution from 'asc builds groups')",
  },
  args: {
    groupId: {
      type: "positional",
      required: true,
      description: "The beta group's ASC id",
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const read = await listGroupBuilds(await cli.client(), ctx.args.groupId, {
      scope,
      ...(pageLimit !== undefined && { pageLimit }),
    });
    emitResult(
      cli.io,
      listEnvelope("testflight groups builds", read, scope, {
        groupId: ctx.args.groupId,
      }),
    );
  },
});

const publicLinkCommand = defineCommand({
  meta: {
    name: "public-link",
    description:
      "Enable or disable a group's public link. HIGH SIDE EFFECT: enabling publicly exposes the app for external recruitment — requires --force to confirm",
  },
  args: {
    groupId: {
      type: "positional",
      required: true,
      description: "The beta group's ASC id",
    },
    enable: {
      type: "boolean",
      description: "Enable the public link (mutually exclusive with --disable)",
    },
    disable: {
      type: "boolean",
      description: "Disable the public link",
    },
    limit: {
      type: "string",
      valueHint: "N",
      description: "Set the public-link install cap to N (enables the limit)",
    },
    "no-limit": {
      type: "boolean",
      description: "Disable the public-link install cap",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const enable = ctx.args.enable === true;
    const disable = ctx.args.disable === true;
    if (enable === disable) {
      throw new CliUsageError(
        "public-link needs exactly one of --enable or --disable.",
      );
    }
    // Enabling exposes the app publicly (no per-person email, but a real
    // external exposure), so require explicit confirmation before doing it.
    if (enable) {
      requireForce(
        ctx.args.force,
        "Enabling a public link (it exposes the app for public recruitment)",
      );
    }
    const limit =
      ctx.args.limit !== undefined
        ? parsePositiveInt(ctx.args.limit, "--limit")
        : undefined;
    if (limit !== undefined && ctx.args["no-limit"] === true) {
      throw new CliUsageError("--limit and --no-limit are mutually exclusive.");
    }
    const document = await setPublicLink(await cli.client(), ctx.args.groupId, {
      enabled: enable,
      ...(limit !== undefined && { limitEnabled: true, limit }),
      ...(ctx.args["no-limit"] === true && { limitEnabled: false }),
    });
    emitResult(
      cli.io,
      documentEnvelope("testflight groups public-link", document, {
        resolved: { enabled: enable },
      }),
    );
  },
});

// --- criteria subgroup (recruitment criteria read/write/clear + options) ---

const criteriaGetCommand = defineCommand({
  meta: {
    name: "get",
    description: "Read a group's recruitment criteria (device/OS filters)",
  },
  args: {
    groupId: {
      type: "positional",
      required: true,
      description: "The beta group's ASC id",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const document = await readRecruitmentCriteria(
      await cli.client(),
      ctx.args.groupId,
    );
    emitResult(
      cli.io,
      documentEnvelope("testflight groups criteria get", document, {
        resolved: { groupId: ctx.args.groupId },
      }),
    );
  },
});

const criteriaSetCommand = defineCommand({
  meta: {
    name: "set",
    description:
      "Set a group's recruitment criteria from --filter deviceFamily:minOs:maxOs (repeatable; upserts the per-group singleton)",
  },
  args: {
    groupId: {
      type: "positional",
      required: true,
      description: "The beta group's ASC id",
    },
    filter: {
      type: "string",
      required: true,
      valueHint: "IPHONE:15.0:17.0",
      description:
        "Device/OS filter deviceFamily:minOs:maxOs (OS bounds optional); pass --filter multiple times",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const filters = parseRecruitmentFilters(ctx.args.filter);
    const client = await cli.client();
    // Resolve the per-group singleton id first so set chooses PATCH vs POST and
    // never trips Apple's "criteria already exists" path.
    const existingId = await findRecruitmentCriterionId(
      client,
      ctx.args.groupId,
    );
    const document = await setRecruitmentCriteria(
      client,
      ctx.args.groupId,
      filters,
      existingId,
    );
    emitResult(
      cli.io,
      documentEnvelope("testflight groups criteria set", document, {
        resolved: {
          groupId: ctx.args.groupId,
          updated: existingId !== undefined,
          filterCount: filters.length,
        },
      }),
    );
  },
});

const criteriaClearCommand = defineCommand({
  meta: {
    name: "clear",
    description: "Clear a group's recruitment criteria (destructive: --force)",
  },
  args: {
    groupId: {
      type: "positional",
      required: true,
      description: "The beta group's ASC id",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    requireForce(ctx.args.force, "Clearing recruitment criteria");
    const client = await cli.client();
    const existingId = await findRecruitmentCriterionId(
      client,
      ctx.args.groupId,
    );
    if (existingId === undefined) {
      emitResult(cli.io, {
        ok: true,
        command: "testflight groups criteria clear",
        data: { groupId: ctx.args.groupId, cleared: false },
        resolved: { reason: "no criteria configured" },
      });
      return;
    }
    await clearRecruitmentCriteria(client, existingId);
    emitResult(cli.io, {
      ok: true,
      command: "testflight groups criteria clear",
      data: {
        groupId: ctx.args.groupId,
        cleared: true,
        criterionId: existingId,
      },
    });
  },
});

const criteriaOptionsCommand = defineCommand({
  meta: {
    name: "options",
    description:
      "List the legal device-family / OS-version matrix for criteria",
  },
  args: { ...readScopeArgs },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const read = await listRecruitmentCriterionOptions(await cli.client(), {
      scope,
      ...(pageLimit !== undefined && { pageLimit }),
    });
    emitResult(
      cli.io,
      listEnvelope("testflight groups criteria options", read, scope),
    );
  },
});

const criteriaCommand = defineCommand({
  meta: {
    name: "criteria",
    description:
      "Read, set, clear, or list the matrix for recruitment criteria",
  },
  subCommands: {
    get: criteriaGetCommand,
    set: criteriaSetCommand,
    clear: criteriaClearCommand,
    options: criteriaOptionsCommand,
  },
});

const criteriaBuildCheckCommand = defineCommand({
  meta: {
    name: "criteria-build-check",
    description:
      "Preflight: does the group's criteria currently match at least one compatible build?",
  },
  args: {
    groupId: {
      type: "positional",
      required: true,
      description: "The beta group's ASC id",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const document = await checkRecruitmentCompatibleBuild(
      await cli.client(),
      ctx.args.groupId,
    );
    emitResult(
      cli.io,
      documentEnvelope("testflight groups criteria-build-check", document, {
        resolved: {
          groupId: ctx.args.groupId,
          hasCompatibleBuild:
            document.data.attributes?.hasCompatibleBuild ?? null,
        },
      }),
    );
  },
});

export const testflightGroupsCommand = defineCommand({
  meta: {
    name: "groups",
    description:
      "Beta groups: list/get/create/update/delete, membership, public link, criteria",
  },
  subCommands: {
    list: listCommand,
    get: getCommand,
    create: createCommand,
    update: updateCommand,
    delete: deleteCommand,
    testers: testersCommand,
    "add-testers": addTestersCommand,
    "remove-testers": removeTestersCommand,
    builds: buildsCommand,
    "public-link": publicLinkCommand,
    criteria: criteriaCommand,
    "criteria-build-check": criteriaBuildCheckCommand,
  },
});
