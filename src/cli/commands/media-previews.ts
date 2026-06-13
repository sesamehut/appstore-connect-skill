import { defineCommand } from "citty";

import {
  deleteAppPreview,
  deleteAppPreviewSet,
  listAppPreviews,
  listAppPreviewSets,
  reorderAppPreviews,
} from "../../capabilities/app-previews.js";
import {
  ensurePreviewSet,
  getPreviewStatus,
  resolveLocalization,
  uploadPreview,
  uploadPreviewSet,
} from "../../workflows/media-assets.js";
import { cliContextOf } from "../context.js";
import { CliUsageError } from "../exit-codes.js";
import {
  PREVIEW_EXTENSIONS,
  parseOrderList,
  readMediaDirectory,
  resolvePreviewType,
  resolveTimeoutMs,
  statInputFile,
  validateFrameTimeCode,
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

const STATUS_COMMAND = "asc media previews status";

const previewTypeArg = {
  "preview-type": {
    type: "string",
    required: true,
    valueHint: "IPHONE_67",
    description: "The preview type (device class); see --help",
  },
} as const;

const listSetsCommand = defineCommand({
  meta: {
    name: "list-sets",
    description: "List a localization's preview sets (one per preview type)",
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
    const read = await listAppPreviewSets(
      await cli.client(),
      localization.localizationId,
      { scope, ...(pageLimit !== undefined && { pageLimit }) },
    );
    emitResult(
      cli.io,
      listEnvelope("media previews list-sets", read, scope, {
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
    description: "List the previews in a set, in display order",
  },
  args: { ...setArg, ...readScopeArgs },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const read = await listAppPreviews(await cli.client(), ctx.args.set, {
      scope,
      ...(pageLimit !== undefined && { pageLimit }),
    });
    emitResult(cli.io, listEnvelope("media previews list", read, scope));
  },
});

const uploadCommand = defineCommand({
  meta: {
    name: "upload",
    description:
      "Upload one preview: reserve, transfer the bytes, commit, and confirm processing (video transcode can take minutes)",
  },
  args: {
    ...versionLocaleArgs,
    ...previewTypeArg,
    file: {
      type: "string",
      required: true,
      valueHint: "path",
      description: "Path to the preview video (.mov/.mp4/.m4v)",
    },
    "mime-type": {
      type: "string",
      valueHint: "video/mp4",
      description: "Override the mimeType (otherwise inferred from extension)",
    },
    "frame-time-code": {
      type: "string",
      valueHint: "00:00:05.000",
      description: "Poster-frame timecode HH:MM:SS[.mmm]",
    },
    ...waitTimeoutArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const previewType = resolvePreviewType(ctx.args["preview-type"]);
    // Pure-format checks before the filesystem stat, so the most fundamental
    // usage error surfaces first.
    validateFrameTimeCode(ctx.args["frame-time-code"]);
    await statInputFile(ctx.args.file);
    const wait = resolveWaitTimeout(ctx.args);

    const client = await cli.client();
    const localization = await resolveLocalization(
      client,
      ctx.args.version,
      ctx.args.locale,
    );
    const ensured = await ensurePreviewSet(
      client,
      localization.localizationId,
      previewType,
    );
    const result = await uploadPreview(client, ensured.set.id, ctx.args.file, {
      ...wait,
      ...(ctx.args["mime-type"] !== undefined && {
        mimeType: ctx.args["mime-type"],
      }),
      ...(ctx.args["frame-time-code"] !== undefined && {
        previewFrameTimeCode: ctx.args["frame-time-code"],
      }),
    });
    const rateLimit = cli.lastRateLimit();
    emitResult(
      cli.io,
      documentEnvelope(
        "media previews upload",
        { data: result.resource.data },
        {
          resolved: {
            versionId: ctx.args.version,
            locale: localization.locale,
            localizationId: localization.localizationId,
            previewType,
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
      "Upload every video in a directory into one preview type's set (appends; --reorder to lead with them)",
  },
  args: {
    ...versionLocaleArgs,
    ...previewTypeArg,
    dir: {
      type: "string",
      required: true,
      valueHint: "path",
      description: "Directory of preview videos, uploaded in filename order",
    },
    reorder: {
      type: "boolean",
      description: "After uploading, order the set to lead with this batch",
    },
    ...waitTimeoutArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const previewType = resolvePreviewType(ctx.args["preview-type"]);
    const files = await readMediaDirectory(ctx.args.dir, PREVIEW_EXTENSIONS);
    const wait = resolveWaitTimeout(ctx.args);

    const client = await cli.client();
    const localization = await resolveLocalization(
      client,
      ctx.args.version,
      ctx.args.locale,
    );
    const result = await uploadPreviewSet(
      client,
      localization.localizationId,
      previewType,
      files,
      { ...wait, ...(ctx.args.reorder === true && { reorder: true }) },
    );
    const rateLimit = cli.lastRateLimit();
    emitResult(
      cli.io,
      documentEnvelope(
        "media previews upload-set",
        { data: result.uploads.map((upload) => upload.resource.data) },
        {
          resolved: {
            versionId: ctx.args.version,
            locale: localization.locale,
            localizationId: localization.localizationId,
            previewType,
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
    description: "Delete one preview (use to clear a dangling reservation)",
  },
  args: {
    previewId: {
      type: "positional",
      required: true,
      description: "The preview's ASC id (from 'list')",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    await deleteAppPreview(await cli.client(), ctx.args.previewId);
    emitResult(cli.io, {
      ok: true,
      command: "media previews delete",
      data: { id: ctx.args.previewId, deleted: true },
    });
  },
});

const deleteSetCommand = defineCommand({
  meta: {
    name: "delete-set",
    description:
      "Delete a preview set (destructive: a non-empty set needs --force and takes its previews with it)",
  },
  args: {
    ...setArg,
    force: {
      type: "boolean",
      description: "Required to delete a set that still holds previews",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const client = await cli.client();
    const existing = await listAppPreviews(client, ctx.args.set, {
      scope: "all-pages",
    });
    if (existing.items.length > 0 && ctx.args.force !== true) {
      throw new CliUsageError(
        `Set ${ctx.args.set} still holds ${String(existing.items.length)} preview(s); pass --force to delete the set and them.`,
      );
    }
    await deleteAppPreviewSet(client, ctx.args.set);
    emitResult(cli.io, {
      ok: true,
      command: "media previews delete-set",
      data: {
        id: ctx.args.set,
        deleted: true,
        deletedPreviews: existing.items.length,
      },
    });
  },
});

const reorderCommand = defineCommand({
  meta: {
    name: "reorder",
    description:
      "Set a set's preview order (the list must be the set's full membership)",
  },
  args: {
    ...setArg,
    order: {
      type: "string",
      required: true,
      valueHint: "id,id,id",
      description: "Preview ids in the desired order (full membership)",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const order = parseOrderList(ctx.args.order);
    await reorderAppPreviews(await cli.client(), ctx.args.set, order);
    emitResult(cli.io, {
      ok: true,
      command: "media previews reorder",
      data: { setId: ctx.args.set, order },
      resolved: { count: order.length },
    });
  },
});

const statusCommand = defineCommand({
  meta: {
    name: "status",
    description:
      "Read a preview's processing state (asset + video); --wait polls to a terminal state",
  },
  args: {
    previewId: {
      type: "positional",
      required: true,
      description: "The preview's ASC id (from 'list' or an upload)",
    },
    wait: {
      type: "boolean",
      description: "Poll until the asset reaches COMPLETE or FAILED",
    },
    timeout: {
      type: "string",
      valueHint: "600",
      description: "Max seconds to wait when --wait is set (default 600)",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const pollTimeoutMs = resolveTimeoutMs(ctx.args.timeout);
    const result = await getPreviewStatus(
      await cli.client(),
      ctx.args.previewId,
      {
        wait: ctx.args.wait === true,
        ...(pollTimeoutMs !== undefined && { pollTimeoutMs }),
      },
    );
    const rateLimit = cli.lastRateLimit();
    emitResult(
      cli.io,
      documentEnvelope(
        "media previews status",
        { data: result.resource.data },
        {
          resolved: statusResultFields(result),
          ...(rateLimit !== undefined && { rateLimit }),
        },
      ),
    );
  },
});

export const mediaPreviewsCommand = defineCommand({
  meta: {
    name: "previews",
    description: "App Store preview (video) sets and previews",
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
