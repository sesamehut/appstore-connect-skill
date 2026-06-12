import { defineCommand } from "citty";

import { getApp, listApps } from "../../capabilities/apps.js";
import type {
  GetAppOptions,
  ListAppsOptions,
} from "../../capabilities/apps.js";
import { cliContextOf } from "../context.js";
import { documentEnvelope, emitResult, listEnvelope } from "../output.js";
import {
  csvList,
  readScopeArgs,
  resolvePageLimit,
  resolveReadScope,
} from "../read-scope.js";

const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "List the apps visible to the API key",
  },
  args: {
    "bundle-id": {
      type: "string",
      valueHint: "id1,id2",
      description: "Filter by bundle id (comma-separated)",
    },
    name: {
      type: "string",
      description: "Filter by app name (comma-separated)",
    },
    sku: { type: "string", description: "Filter by SKU (comma-separated)" },
    fields: {
      type: "string",
      valueHint: "name,bundleId",
      description: "Sparse field selection for apps (comma-separated)",
    },
    sort: {
      type: "string",
      valueHint: "name",
      description: "Sort expression, e.g. name or -name",
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const bundleId = csvList(ctx.args["bundle-id"]);
    const name = csvList(ctx.args.name);
    const sku = csvList(ctx.args.sku);
    // CLI inputs are user strings; ASC validates field and sort names — the
    // cast marks the typed-contract boundary, not a checked invariant.
    const fields = csvList(ctx.args.fields) as ListAppsOptions["fields"];
    const sort = csvList(ctx.args.sort) as ListAppsOptions["sort"];

    const read = await listApps(await cli.client(), {
      scope,
      ...(pageLimit !== undefined && { pageLimit }),
      ...(bundleId !== undefined && { bundleId }),
      ...(name !== undefined && { name }),
      ...(sku !== undefined && { sku }),
      ...(fields !== undefined && { fields }),
      ...(sort !== undefined && { sort }),
    });
    emitResult(cli.io, listEnvelope("apps list", read, scope));
  },
});

const getCommand = defineCommand({
  meta: {
    name: "get",
    description: "Read one app by its ASC id",
  },
  args: {
    appId: {
      type: "positional",
      required: true,
      description: "The app's ASC id (from 'asc apps list')",
    },
    fields: {
      type: "string",
      valueHint: "name,bundleId",
      description: "Sparse field selection for the app (comma-separated)",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const fields = csvList(ctx.args.fields) as GetAppOptions["fields"];
    const document = await getApp(await cli.client(), ctx.args.appId, {
      ...(fields !== undefined && { fields }),
    });
    const rateLimit = cli.lastRateLimit();
    emitResult(
      cli.io,
      documentEnvelope("apps get", document, {
        ...(rateLimit !== undefined && { rateLimit }),
      }),
    );
  },
});

export const appsCommand = defineCommand({
  meta: {
    name: "apps",
    description: "List apps and read app details",
  },
  subCommands: {
    list: listCommand,
    get: getCommand,
  },
});
