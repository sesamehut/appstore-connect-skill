import { readFile } from "node:fs/promises";

import { defineCommand } from "citty";

import {
  createBetaTester,
  deleteBetaTester,
  getBetaTester,
  listBetaTesters,
  removeTesterFromApp,
} from "../../capabilities/beta-testers.js";
import type {
  BetaInviteType,
  GetBetaTesterOptions,
  ListBetaTestersOptions,
} from "../../capabilities/beta-testers.js";
import { bulkAddTestersToGroup } from "../../workflows/beta-distribution.js";
import { cliContextOf } from "../context.js";
import { CliUsageError } from "../exit-codes.js";
import { documentEnvelope, emitResult, listEnvelope } from "../output.js";
import {
  csvList,
  readScopeArgs,
  resolvePageLimit,
  resolveReadScope,
} from "../read-scope.js";
import { forceArg, requireForce, requireIdList } from "./testflight-shared.js";

const listCommand = defineCommand({
  meta: {
    name: "list",
    description:
      "List beta testers, filterable by app, group, build, email, or invite type",
  },
  args: {
    app: {
      type: "string",
      valueHint: "appId",
      description: "Restrict to testers of these app id(s) (comma-separated)",
    },
    group: {
      type: "string",
      valueHint: "groupId",
      description: "Restrict to members of these group id(s)",
    },
    build: {
      type: "string",
      valueHint: "buildId",
      description: "Restrict to testers of these build id(s)",
    },
    email: {
      type: "string",
      valueHint: "a@x.com",
      description: "Exact email match (the lookup key for a known tester)",
    },
    "invite-type": {
      type: "string",
      valueHint: "EMAIL",
      description: "Filter by invite type: EMAIL or PUBLIC_LINK",
    },
    sort: {
      type: "string",
      valueHint: "-state",
      description:
        "Sort key (e.g. email, -email, state, -state; also firstName/lastName/inviteType)",
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const options: ListBetaTestersOptions = {
      scope,
      ...(pageLimit !== undefined && { pageLimit }),
      ...(csvList(ctx.args.app) !== undefined && {
        apps: csvList(ctx.args.app),
      }),
      ...(csvList(ctx.args.group) !== undefined && {
        betaGroups: csvList(ctx.args.group),
      }),
      ...(csvList(ctx.args.build) !== undefined && {
        builds: csvList(ctx.args.build),
      }),
      ...(ctx.args.email !== undefined && { email: [ctx.args.email] }),
      ...(ctx.args["invite-type"] !== undefined && {
        // Enum passes through for ASC to validate.
        inviteType: [ctx.args["invite-type"] as BetaInviteType],
      }),
      ...(csvList(ctx.args.sort) !== undefined && {
        sort: csvList(ctx.args.sort) as ListBetaTestersOptions["sort"],
      }),
    };
    const read = await listBetaTesters(await cli.client(), options);
    emitResult(cli.io, listEnvelope("testflight testers list", read, scope));
  },
});

const getCommand = defineCommand({
  meta: {
    name: "get",
    description:
      "Read one beta tester, optionally including apps/groups/builds",
  },
  args: {
    testerId: {
      type: "positional",
      required: true,
      description: "The tester's ASC id (from 'list')",
    },
    include: {
      type: "string",
      valueHint: "apps,betaGroups,builds",
      description: "Related resources to include (comma-separated)",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const options: GetBetaTesterOptions = {
      ...(csvList(ctx.args.include) !== undefined && {
        include: csvList(ctx.args.include) as GetBetaTesterOptions["include"],
      }),
    };
    const document = await getBetaTester(
      await cli.client(),
      ctx.args.testerId,
      options,
    );
    emitResult(cli.io, documentEnvelope("testflight testers get", document));
  },
});

const createCommand = defineCommand({
  meta: {
    name: "create",
    description:
      "Create a beta tester. HIGH SIDE EFFECT: linking to a group with a distributable build emails a real TestFlight invitation. Requires --force",
  },
  args: {
    email: {
      type: "string",
      required: true,
      valueHint: "a@x.com",
      description:
        "The tester's email (fixed at creation; betaTesters have no update)",
    },
    "first-name": {
      type: "string",
      valueHint: "Ada",
      description: "First name (optional; fixed at creation)",
    },
    "last-name": {
      type: "string",
      valueHint: "Lovelace",
      description: "Last name (optional; fixed at creation)",
    },
    group: {
      type: "string",
      valueHint: "id,id",
      description:
        "Group id(s) to link at creation (this is what emails invitations)",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    // live-verify (实机核实 #1): whether a bare create (no group) also emails is
    // unconfirmed; treat any create as potentially notifying and gate it.
    requireForce(
      ctx.args.force,
      "Creating a tester (it may email a real invitation)",
    );
    const groupIds = csvList(ctx.args.group);
    const document = await createBetaTester(
      await cli.client(),
      {
        email: ctx.args.email,
        ...(ctx.args["first-name"] !== undefined && {
          firstName: ctx.args["first-name"],
        }),
        ...(ctx.args["last-name"] !== undefined && {
          lastName: ctx.args["last-name"],
        }),
      },
      { ...(groupIds !== undefined && { betaGroupIds: groupIds }) },
    );
    emitResult(
      cli.io,
      documentEnvelope("testflight testers create", document, {
        resolved: {
          email: ctx.args.email,
          ...(groupIds !== undefined && { linkedGroups: groupIds }),
        },
      }),
    );
  },
});

const bulkAddCommand = defineCommand({
  meta: {
    name: "bulk-add",
    description:
      "Find-or-create a tester per email and add them all to a group in one batch. HIGH SIDE EFFECT: emails a real invitation per tester. Requires --force",
  },
  args: {
    group: {
      type: "string",
      required: true,
      valueHint: "groupId",
      description: "The group to add the testers to",
    },
    emails: {
      type: "string",
      valueHint: "a@x,b@y",
      description: "Comma-separated emails (exclusive with --emails-file)",
    },
    "emails-file": {
      type: "string",
      valueHint: "path",
      description: "File with one email per line (exclusive with --emails)",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    requireForce(
      ctx.args.force,
      "Bulk-adding testers to a group (it emails real invitations)",
    );
    const inline = csvList(ctx.args.emails);
    const fromFile = ctx.args["emails-file"];
    if (inline !== undefined && fromFile !== undefined) {
      throw new CliUsageError(
        "Pass exactly one of --emails <list> or --emails-file <path>.",
      );
    }
    let emails: string[];
    if (inline !== undefined) {
      emails = [...inline];
    } else if (fromFile !== undefined) {
      let content: string;
      try {
        content = await readFile(fromFile, "utf8");
      } catch {
        throw new CliUsageError(`Cannot read --emails-file at "${fromFile}".`);
      }
      emails = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== "");
    } else {
      throw new CliUsageError(
        "Pass exactly one of --emails <list> or --emails-file <path>.",
      );
    }
    if (emails.length === 0) {
      throw new CliUsageError("No emails to add.");
    }
    const result = await bulkAddTestersToGroup(
      await cli.client(),
      ctx.args.group,
      emails,
    );
    emitResult(cli.io, {
      ok: true,
      command: "testflight testers bulk-add",
      data: {
        groupId: ctx.args.group,
        testerIds: result.testerIds,
        createdEmails: result.createdEmails,
        linkageBatches: result.linkageBatches,
        count: result.testerIds.length,
      },
    });
  },
});

const deleteCommand = defineCommand({
  meta: {
    name: "delete",
    description:
      "Delete a tester at the account level (destructive: --force; the removal is asynchronous, so the result is 'accepted', not 'gone')",
  },
  args: {
    testerId: {
      type: "positional",
      required: true,
      description: "The tester's ASC id",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    requireForce(ctx.args.force, "Deleting a tester");
    await deleteBetaTester(await cli.client(), ctx.args.testerId);
    emitResult(cli.io, {
      ok: true,
      command: "testflight testers delete",
      // 202/204 async (live-verify #4): "accepted", not asserting immediate gone.
      data: { id: ctx.args.testerId, deleteAccepted: true },
    });
  },
});

const removeFromAppCommand = defineCommand({
  meta: {
    name: "remove-from-app",
    description:
      "Revoke a tester's access to specific apps (destructive: --force; asynchronous)",
  },
  args: {
    testerId: {
      type: "positional",
      required: true,
      description: "The tester's ASC id",
    },
    app: {
      type: "string",
      required: true,
      valueHint: "id,id",
      description: "App id(s) to revoke access from",
    },
    ...forceArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    requireForce(ctx.args.force, "Removing a tester from apps");
    const appIds = requireIdList(ctx.args.app, "--app");
    await removeTesterFromApp(await cli.client(), ctx.args.testerId, appIds);
    emitResult(cli.io, {
      ok: true,
      command: "testflight testers remove-from-app",
      data: {
        testerId: ctx.args.testerId,
        apps: appIds,
        removeAccepted: true,
      },
    });
  },
});

export const testflightTestersCommand = defineCommand({
  meta: {
    name: "testers",
    description:
      "Beta testers: list/get/create/bulk-add/delete/remove-from-app",
  },
  subCommands: {
    list: listCommand,
    get: getCommand,
    create: createCommand,
    "bulk-add": bulkAddCommand,
    delete: deleteCommand,
    "remove-from-app": removeFromAppCommand,
  },
});
