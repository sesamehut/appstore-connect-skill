import { defineCommand } from "citty";

import {
  deleteAppScreenshot,
  deleteAppScreenshotSet,
  listAppScreenshots,
  listAppScreenshotSets,
  reorderAppScreenshots,
} from "../../capabilities/app-screenshots.js";
import {
  ensureScreenshotSet,
  getScreenshotStatus,
  resolveLocalization,
  uploadScreenshot,
  uploadScreenshotSet,
} from "../../workflows/media-assets.js";
import { cliContextOf } from "../context.js";
import { CliUsageError } from "../exit-codes.js";
import {
  SCREENSHOT_EXTENSIONS,
  parseOrderList,
  readMediaDirectory,
  resolveScreenshotDisplayType,
  resolveTimeoutMs,
  statInputFile,
} from "../media-flags.js";
import { documentEnvelope, emitResult, listEnvelope } from "../output.js";
import {
  readScopeArgs,
  resolvePageLimit,
  resolveReadScope,
} from "../read-scope.js";
import {
  resolveWaitTimeout,
  setArg,
  statusResultFields,
  uploadResultFields,
  uploadSetResultFields,
  versionLocaleArgs,
  waitTimeoutArgs,
} from "./media-shared.js";

const STATUS_COMMAND = "asc media screenshots status";

const displayTypeArg = {
  "display-type": {
    type: "string",
    required: true,
    valueHint: "APP_IPHONE_67",
    description: "The screenshot display type (device class); see --help",
  },
} as const;

const listSetsCommand = defineCommand({
  meta: {
    name: "list-sets",
    description: "List a localization's screenshot sets (one per display type)",
  },
  args: { ...versionLocaleArgs, ...readScopeArgs },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const localization = await resolveLocalization(
      await cli.client(),
      ctx.args.version,
      ctx.args.locale,
    );
    const read = await listAppScreenshotSets(
      await cli.client(),
      localization.localizationId,
      { scope, ...(pageLimit !== undefined && { pageLimit }) },
    );
    emitResult(
      cli.io,
      listEnvelope("media screenshots list-sets", read, scope, {
        versionId: ctx.args.version,
        locale: localization.locale,
        localizationId: localization.localizationId,
      }),
    );
  },
});

const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "List the screenshots in a set, in display order",
  },
  args: { ...setArg, ...readScopeArgs },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const read = await listAppScreenshots(await cli.client(), ctx.args.set, {
      scope,
      ...(pageLimit !== undefined && { pageLimit }),
    });
    emitResult(cli.io, listEnvelope("media screenshots list", read, scope));
  },
});

const uploadCommand = defineCommand({
  meta: {
    name: "upload",
    description:
      "Upload one screenshot: reserve, transfer the bytes, commit, and confirm processing",
  },
  args: {
    ...versionLocaleArgs,
    ...displayTypeArg,
    file: {
      type: "string",
      required: true,
      valueHint: "path",
      description: "Path to the screenshot image (PNG/JPEG)",
    },
    ...waitTimeoutArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const displayType = resolveScreenshotDisplayType(ctx.args["display-type"]);
    await statInputFile(ctx.args.file);
    const wait = resolveWaitTimeout(ctx.args);

    const client = await cli.client();
    const localization = await resolveLocalization(
      client,
      ctx.args.version,
      ctx.args.locale,
    );
    const ensured = await ensureScreenshotSet(
      client,
      localization.localizationId,
      displayType,
    );
    const result = await uploadScreenshot(
      client,
      ensured.set.id,
      ctx.args.file,
      wait,
    );
    const rateLimit = cli.lastRateLimit();
    emitResult(
      cli.io,
      documentEnvelope(
        "media screenshots upload",
        { data: result.resource.data },
        {
          resolved: {
            versionId: ctx.args.version,
            locale: localization.locale,
            localizationId: localization.localizationId,
            displayType,
            setId: ensured.set.id,
            setCreated: ensured.created,
            ...uploadResultFields(result, STATUS_COMMAND),
          },
          ...(rateLimit !== undefined && { rateLimit }),
        },
      ),
    );
  },
});

const uploadSetCommand = defineCommand({
  meta: {
    name: "upload-set",
    description:
      "Upload every image in a directory into one display type's set (appends; --reorder to lead with them)",
  },
  args: {
    ...versionLocaleArgs,
    ...displayTypeArg,
    dir: {
      type: "string",
      required: true,
      valueHint: "path",
      description: "Directory of screenshot images, uploaded in filename order",
    },
    reorder: {
      type: "boolean",
      description: "After uploading, order the set to lead with this batch",
    },
    ...waitTimeoutArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const displayType = resolveScreenshotDisplayType(ctx.args["display-type"]);
    const files = await readMediaDirectory(ctx.args.dir, SCREENSHOT_EXTENSIONS);
    const wait = resolveWaitTimeout(ctx.args);

    const client = await cli.client();
    const localization = await resolveLocalization(
      client,
      ctx.args.version,
      ctx.args.locale,
    );
    const result = await uploadScreenshotSet(
      client,
      localization.localizationId,
      displayType,
      files,
      { ...wait, ...(ctx.args.reorder === true && { reorder: true }) },
    );
    const rateLimit = cli.lastRateLimit();
    emitResult(
      cli.io,
      documentEnvelope(
        "media screenshots upload-set",
        { data: result.uploads.map((upload) => upload.resource.data) },
        {
          resolved: {
            versionId: ctx.args.version,
            locale: localization.locale,
            localizationId: localization.localizationId,
            displayType,
            ...uploadSetResultFields(result, STATUS_COMMAND),
          },
          ...(rateLimit !== undefined && { rateLimit }),
        },
      ),
    );
  },
});

const deleteCommand = defineCommand({
  meta: {
    name: "delete",
    description: "Delete one screenshot (use to clear a dangling reservation)",
  },
  args: {
    screenshotId: {
      type: "positional",
      required: true,
      description: "The screenshot's ASC id (from 'list')",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    await deleteAppScreenshot(await cli.client(), ctx.args.screenshotId);
    emitResult(cli.io, {
      ok: true,
      command: "media screenshots delete",
      data: { id: ctx.args.screenshotId, deleted: true },
    });
  },
});

const deleteSetCommand = defineCommand({
  meta: {
    name: "delete-set",
    description:
      "Delete a screenshot set (destructive: a non-empty set needs --force and takes its screenshots with it)",
  },
  args: {
    ...setArg,
    force: {
      type: "boolean",
      description: "Required to delete a set that still holds screenshots",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const client = await cli.client();
    const existing = await listAppScreenshots(client, ctx.args.set, {
      scope: "all-pages",
    });
    if (existing.items.length > 0 && ctx.args.force !== true) {
      throw new CliUsageError(
        `Set ${ctx.args.set} still holds ${String(existing.items.length)} screenshot(s); pass --force to delete the set and them.`,
      );
    }
    await deleteAppScreenshotSet(client, ctx.args.set);
    emitResult(cli.io, {
      ok: true,
      command: "media screenshots delete-set",
      data: {
        id: ctx.args.set,
        deleted: true,
        deletedScreenshots: existing.items.length,
      },
    });
  },
});

const reorderCommand = defineCommand({
  meta: {
    name: "reorder",
    description:
      "Set a set's screenshot order (the list must be the set's full membership)",
  },
  args: {
    ...setArg,
    order: {
      type: "string",
      required: true,
      valueHint: "id,id,id",
      description: "Screenshot ids in the desired order (full membership)",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const order = parseOrderList(ctx.args.order);
    await reorderAppScreenshots(await cli.client(), ctx.args.set, order);
    emitResult(cli.io, {
      ok: true,
      command: "media screenshots reorder",
      data: { setId: ctx.args.set, order },
      resolved: { count: order.length },
    });
  },
});

const statusCommand = defineCommand({
  meta: {
    name: "status",
    description:
      "Read a screenshot's processing state; --wait polls it to a terminal state",
  },
  args: {
    screenshotId: {
      type: "positional",
      required: true,
      description: "The screenshot's ASC id (from 'list' or an upload)",
    },
    wait: {
      type: "boolean",
      description: "Poll until the asset reaches COMPLETE or FAILED",
    },
    timeout: {
      type: "string",
      valueHint: "60",
      description: "Max seconds to wait when --wait is set (default 60)",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const pollTimeoutMs = resolveTimeoutMs(ctx.args.timeout);
    const result = await getScreenshotStatus(
      await cli.client(),
      ctx.args.screenshotId,
      {
        wait: ctx.args.wait === true,
        ...(pollTimeoutMs !== undefined && { pollTimeoutMs }),
      },
    );
    const rateLimit = cli.lastRateLimit();
    emitResult(
      cli.io,
      documentEnvelope(
        "media screenshots status",
        { data: result.resource.data },
        {
          resolved: statusResultFields(result),
          ...(rateLimit !== undefined && { rateLimit }),
        },
      ),
    );
  },
});

export const mediaScreenshotsCommand = defineCommand({
  meta: {
    name: "screenshots",
    description: "App Store screenshot sets and screenshots",
  },
  subCommands: {
    "list-sets": listSetsCommand,
    list: listCommand,
    upload: uploadCommand,
    "upload-set": uploadSetCommand,
    delete: deleteCommand,
    "delete-set": deleteSetCommand,
    reorder: reorderCommand,
    status: statusCommand,
  },
});
