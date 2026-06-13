import { defineCommand } from "citty";

import {
  getCrashFeedback,
  getCrashLog,
  getScreenshotFeedback,
  listCrashFeedback,
  listScreenshotFeedback,
} from "../../capabilities/testflight-feedback.js";
import type {
  BetaFeedbackScreenshotSubmission,
  GetCrashFeedbackOptions,
  GetScreenshotFeedbackOptions,
  ListFeedbackOptions,
} from "../../capabilities/testflight-feedback.js";
import {
  downloadFeedbackAttachments,
  sanitizeScreenshotUrl,
} from "../../workflows/feedback-files.js";
import type {
  DownloadFeedbackTarget,
  FeedbackKind,
} from "../../workflows/feedback-files.js";
import { cliContextOf } from "../context.js";
import { CliUsageError, EXIT } from "../exit-codes.js";
import { documentEnvelope, emitResult, listEnvelope } from "../output.js";
import {
  csvList,
  readScopeArgs,
  resolvePageLimit,
  resolveReadScope,
} from "../read-scope.js";

/** The filter flags shared by both list verbs (app-scoped collections). */
const feedbackFilterArgs = {
  app: {
    type: "string",
    required: true,
    valueHint: "appId",
    description: "The app's ASC id (feedback is only listable per app)",
  },
  build: {
    type: "string",
    valueHint: "id,id",
    description: "Narrow to specific build id(s)",
  },
  tester: {
    type: "string",
    valueHint: "id,id",
    description: "Narrow to specific tester id(s)",
  },
  "device-model": {
    type: "string",
    valueHint: "iPhone15,3",
    description: "Filter by device model(s)",
  },
  "os-version": {
    type: "string",
    valueHint: "17.0",
    description: "Filter by OS version(s)",
  },
  sort: {
    type: "string",
    valueHint: "-createdDate",
    description: "Sort: createdDate or -createdDate (the only valid keys)",
  },
} as const;

interface FeedbackFilterArgs {
  readonly build?: string | undefined;
  readonly tester?: string | undefined;
  readonly "device-model"?: string | undefined;
  readonly "os-version"?: string | undefined;
  readonly sort?: string | undefined;
}

function listFeedbackOptions(
  args: FeedbackFilterArgs,
  scope: ListFeedbackOptions["scope"],
  pageLimit: number | undefined,
): ListFeedbackOptions {
  const build = csvList(args.build);
  const tester = csvList(args.tester);
  const deviceModel = csvList(args["device-model"]);
  const osVersion = csvList(args["os-version"]);
  const sort = csvList(args.sort) as ListFeedbackOptions["sort"];
  return {
    scope,
    ...(pageLimit !== undefined && { pageLimit }),
    ...(build !== undefined && { build }),
    ...(tester !== undefined && { tester }),
    ...(deviceModel !== undefined && { deviceModel }),
    ...(osVersion !== undefined && { osVersion }),
    ...(sort !== undefined && { sort }),
  };
}

/**
 * Replaces every signed screenshot URL with its de-queried form before the
 * submission reaches an envelope. The contract inlines short-lived SIGNED URLs
 * at attributes.screenshots[].url (with sig=/token= in the query) — a secret
 * that must never surface on stdout (m7-testflight.md:67). width/height/
 * expirationDate are kept; `url` is dropped and replaced with `sanitizedUrl`
 * (origin+pathname). Returns a shallow copy; Apple's document is not mutated.
 * The return type widens to `unknown` because the rewritten screenshots no
 * longer match the contract's `BetaFeedbackScreenshotImage` (they swap `url`
 * for `sanitizedUrl`), and the envelope treats `data` as opaque anyway.
 */
function sanitizeScreenshotSubmission(
  submission: BetaFeedbackScreenshotSubmission,
): unknown {
  const screenshots = submission.attributes?.screenshots;
  if (screenshots === undefined) {
    return submission;
  }
  return {
    ...submission,
    attributes: {
      ...submission.attributes,
      screenshots: screenshots.map((image) => {
        const { url, ...rest } = image;
        const sanitizedUrl =
          url === undefined ? undefined : sanitizeScreenshotUrl(url);
        return {
          ...rest,
          ...(sanitizedUrl !== undefined && { sanitizedUrl }),
        };
      }),
    },
  };
}

const listCrashesCommand = defineCommand({
  meta: {
    name: "list-crashes",
    description: "List an app's crash feedback submissions",
  },
  args: { ...feedbackFilterArgs, ...readScopeArgs },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const read = await listCrashFeedback(
      await cli.client(),
      ctx.args.app,
      listFeedbackOptions(ctx.args, scope, pageLimit),
    );
    emitResult(
      cli.io,
      listEnvelope("testflight feedback list-crashes", read, scope, {
        appId: ctx.args.app,
      }),
    );
  },
});

const listScreenshotsCommand = defineCommand({
  meta: {
    name: "list-screenshots",
    description: "List an app's screenshot feedback submissions",
  },
  args: { ...feedbackFilterArgs, ...readScopeArgs },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const read = await listScreenshotFeedback(
      await cli.client(),
      ctx.args.app,
      listFeedbackOptions(ctx.args, scope, pageLimit),
    );
    // Each item inlines signed screenshot URLs; de-query every one before it
    // can reach stdout (the leak invariant), keeping the rest of the read.
    const sanitized = {
      ...read,
      items: read.items.map(sanitizeScreenshotSubmission),
    };
    emitResult(
      cli.io,
      listEnvelope("testflight feedback list-screenshots", sanitized, scope, {
        appId: ctx.args.app,
      }),
    );
  },
});

const getCrashCommand = defineCommand({
  meta: {
    name: "get-crash",
    description:
      "Read one crash feedback submission (--with-log inlines the crash log text)",
  },
  args: {
    id: {
      type: "string",
      required: true,
      valueHint: "submissionId",
      description: "The crash submission's ASC id",
    },
    include: {
      type: "string",
      valueHint: "build,tester",
      description: "Related resources to include",
    },
    "with-log": {
      type: "boolean",
      description:
        "Also fetch the crash log text (inlined in the authenticated JSON)",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const client = await cli.client();
    const options: GetCrashFeedbackOptions = {
      ...(csvList(ctx.args.include) !== undefined && {
        include: csvList(
          ctx.args.include,
        ) as GetCrashFeedbackOptions["include"],
      }),
    };
    const document = await getCrashFeedback(client, ctx.args.id, options);
    let logText: string | undefined;
    if (ctx.args["with-log"] === true) {
      const log = await getCrashLog(client, ctx.args.id);
      logText = log.data.attributes?.logText;
    }
    emitResult(
      cli.io,
      documentEnvelope("testflight feedback get-crash", document, {
        ...(logText !== undefined && { resolved: { logText } }),
      }),
    );
  },
});

const getScreenshotCommand = defineCommand({
  meta: {
    name: "get-screenshot",
    description:
      "Read one screenshot feedback submission. The signed image URLs are de-queried to origin+path (sanitizedUrl); use 'download' to fetch the bytes",
  },
  args: {
    id: {
      type: "string",
      required: true,
      valueHint: "submissionId",
      description: "The screenshot submission's ASC id",
    },
    include: {
      type: "string",
      valueHint: "build,tester",
      description: "Related resources to include",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const options: GetScreenshotFeedbackOptions = {
      ...(csvList(ctx.args.include) !== undefined && {
        include: csvList(
          ctx.args.include,
        ) as GetScreenshotFeedbackOptions["include"],
      }),
    };
    const document = await getScreenshotFeedback(
      await cli.client(),
      ctx.args.id,
      options,
    );
    // The screenshots[] in attributes carry short-lived signed URLs (secrets).
    // De-query them before enveloping so stdout never carries a signature; the
    // agent uses 'download' to fetch the bytes. `included` is BetaTester|Build
    // only (no screenshots-bearing resource), so it passes through verbatim.
    emitResult(
      cli.io,
      documentEnvelope("testflight feedback get-screenshot", {
        data: sanitizeScreenshotSubmission(document.data),
        ...(document.included !== undefined && { included: document.included }),
      }),
    );
  },
});

function parseKind(raw: string | undefined): FeedbackKind {
  if (raw === "crash" || raw === "screenshot") {
    return raw;
  }
  throw new CliUsageError(
    `--kind expects crash, screenshot, or both, got "${raw ?? "(missing)"}".`,
  );
}

const downloadCommand = defineCommand({
  meta: {
    name: "download",
    description:
      "Download feedback attachments to a directory (screenshots via auth-free signed URLs, crash logs from the authenticated JSON). The envelope NEVER contains a signed URL — only on-disk paths",
  },
  args: {
    id: {
      type: "string",
      valueHint: "submissionId",
      description: "A single submission id (requires --kind crash|screenshot)",
    },
    app: {
      type: "string",
      valueHint: "appId",
      description: "Enumerate an app's feedback instead of one id",
    },
    kind: {
      type: "string",
      valueHint: "both",
      description: "crash, screenshot, or both (default both in --app mode)",
    },
    output: {
      type: "string",
      required: true,
      valueHint: "dir",
      description: "Destination directory for the attachments",
    },
    build: {
      type: "string",
      valueHint: "id,id",
      description: "(--app mode) narrow to build id(s)",
    },
    tester: {
      type: "string",
      valueHint: "id,id",
      description: "(--app mode) narrow to tester id(s)",
    },
    "device-model": {
      type: "string",
      valueHint: "iPhone15,3",
      description: "(--app mode) filter by device model(s)",
    },
    "os-version": {
      type: "string",
      valueHint: "17.0",
      description: "(--app mode) filter by OS version(s)",
    },
    sort: {
      type: "string",
      valueHint: "-createdDate",
      description:
        "(--app mode) sort: createdDate or -createdDate (the only valid keys)",
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const hasId = ctx.args.id !== undefined;
    const hasApp = ctx.args.app !== undefined;
    if (hasId === hasApp) {
      throw new CliUsageError(
        "Pass exactly one of --id <submissionId> (+ --kind) or --app <appId> (to enumerate).",
      );
    }
    const scope = resolveReadScope(ctx.args);

    let target: DownloadFeedbackTarget;
    const id = ctx.args.id;
    const app = ctx.args.app;
    if (id !== undefined) {
      if (ctx.args.kind === undefined) {
        throw new CliUsageError(
          "--id requires --kind crash or --kind screenshot.",
        );
      }
      target = { id, kind: parseKind(ctx.args.kind) };
    } else if (app !== undefined) {
      const kinds: readonly FeedbackKind[] =
        ctx.args.kind === undefined || ctx.args.kind === "both"
          ? ["crash", "screenshot"]
          : [parseKind(ctx.args.kind)];
      const build = csvList(ctx.args.build);
      const tester = csvList(ctx.args.tester);
      const deviceModel = csvList(ctx.args["device-model"]);
      const osVersion = csvList(ctx.args["os-version"]);
      const sort = csvList(ctx.args.sort) as ListFeedbackOptions["sort"];
      const listOptions: NonNullable<DownloadFeedbackTarget["listOptions"]> = {
        ...(build !== undefined && { build }),
        ...(tester !== undefined && { tester }),
        ...(deviceModel !== undefined && { deviceModel }),
        ...(osVersion !== undefined && { osVersion }),
        ...(sort !== undefined && { sort }),
      };
      target = {
        appId: app,
        kinds,
        scope,
        ...(Object.keys(listOptions).length > 0 && { listOptions }),
      };
    } else {
      // Unreachable: the exactly-one validation above already threw.
      throw new CliUsageError(
        "Pass exactly one of --id <submissionId> (+ --kind) or --app <appId>.",
      );
    }

    const summary = await downloadFeedbackAttachments(
      await cli.client(),
      target,
      ctx.args.output,
    );
    const rateLimit = cli.lastRateLimit();
    emitResult(cli.io, {
      ok: true,
      command: "testflight feedback download",
      data: {
        outputDir: ctx.args.output,
        // The summary items carry on-disk paths, bytes, dimensions,
        // expirationDate, and a de-queried sanitizedUrl — never the signed URL.
        submissions: summary.submissions,
        totals: summary.totals,
      },
      ...(rateLimit !== undefined && { rateLimit }),
    });
    // Continue-on-error keeps the populated envelope (the completed batch with
    // full per-item detail), but the exit code is the failure signal and must
    // take the MOST SEVERE per-item result (m7-testflight.md:188): any genuine
    // per-item failure (error set, not a not-found "skip") makes the batch
    // exit 3. Per-item failures originate as AscFileProcessingError, which maps
    // to ascRequest, so 3 is the consistent code. Mirrors doctor.ts: structured
    // envelope on stdout AND a numeric exit returned from run().
    const anyFailed = summary.submissions.some(
      (item) => item.error !== undefined,
    );
    return anyFailed ? EXIT.ascRequest : EXIT.success;
  },
});

export const testflightFeedbackCommand = defineCommand({
  meta: {
    name: "feedback",
    description:
      "TestFlight feedback (read-only): list-crashes/list-screenshots/get-crash/get-screenshot/download",
  },
  subCommands: {
    "list-crashes": listCrashesCommand,
    "list-screenshots": listScreenshotsCommand,
    "get-crash": getCrashCommand,
    "get-screenshot": getScreenshotCommand,
    download: downloadCommand,
  },
});
