import { defineCommand } from "citty";

import { listAppStoreVersions } from "../../capabilities/app-store-versions.js";
import type { ListAppStoreVersionsOptions } from "../../capabilities/app-store-versions.js";
import { cliContextOf } from "../context.js";
import { emitResult, listEnvelope } from "../output.js";
import {
  csvList,
  readScopeArgs,
  resolvePageLimit,
  resolveReadScope,
} from "../read-scope.js";

const listCommand = defineCommand({
  meta: {
    name: "list",
    description:
      "List an app's App Store versions (find the editable one via --state PREPARE_FOR_SUBMISSION)",
  },
  args: {
    app: {
      type: "string",
      required: true,
      valueHint: "appId",
      description: "The app's ASC id (from 'asc apps list')",
    },
    platform: {
      type: "string",
      valueHint: "IOS",
      description: "Filter by platform: IOS, MAC_OS, TV_OS, VISION_OS",
    },
    state: {
      type: "string",
      valueHint: "PREPARE_FOR_SUBMISSION",
      description: "Filter by current version state (comma-separated)",
    },
    fields: {
      type: "string",
      valueHint: "versionString,appVersionState",
      description: "Sparse field selection for versions (comma-separated)",
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    // CLI inputs are user strings; ASC validates the enum values — the cast
    // marks the typed-contract boundary, not a checked invariant.
    const platform = csvList(
      ctx.args.platform,
    ) as ListAppStoreVersionsOptions["platform"];
    const appVersionState = csvList(
      ctx.args.state,
    ) as ListAppStoreVersionsOptions["appVersionState"];
    const fields = csvList(
      ctx.args.fields,
    ) as ListAppStoreVersionsOptions["fields"];

    const read = await listAppStoreVersions(await cli.client(), ctx.args.app, {
      scope,
      ...(pageLimit !== undefined && { pageLimit }),
      ...(platform !== undefined && { platform }),
      ...(appVersionState !== undefined && { appVersionState }),
      ...(fields !== undefined && { fields }),
    });
    emitResult(cli.io, listEnvelope("versions list", read, scope));
  },
});

export const versionsCommand = defineCommand({
  meta: {
    name: "versions",
    description: "List an app's App Store versions",
  },
  subCommands: {
    list: listCommand,
  },
});
