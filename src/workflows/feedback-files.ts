import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import {
  getCrashLog,
  getScreenshotFeedback,
  listCrashFeedback,
  listScreenshotFeedback,
} from "../capabilities/testflight-feedback.js";
import type {
  BetaFeedbackScreenshotImage,
  ListFeedbackOptions,
} from "../capabilities/testflight-feedback.js";
import { AscFileProcessingError, AscNotFoundError } from "../errors.js";
import type { AscClient } from "../http/client.js";
import { downloadExternalBinaryFile } from "./report-files.js";
import type { RetryOptions } from "../http/transport.js";

/**
 * A single screenshot's outcome; NEVER carries the signed URL's query. Normally
 * this is a file landed on disk (path + bytesWritten). When the signed URL was
 * already expired before the fetch, it is instead recorded as `skipped` with a
 * `reason` and no on-disk file — a proactive skip, distinct from a per-item
 * download error (m7-testflight.md:186).
 */
export interface SavedScreenshotFile {
  /** Absent when the image was skipped before any download. */
  readonly path?: string;
  readonly bytesWritten?: number;
  readonly width?: number;
  readonly height?: number;
  readonly expirationDate?: string;
  /** Origin + path only — the signed query (a secret) is stripped. */
  readonly sanitizedUrl?: string;
  /** True when the signed URL was already expired and no fetch was issued. */
  readonly skipped?: boolean;
  /** Why the image was skipped (only set when `skipped`). */
  readonly reason?: string;
}

/** A crash log written to disk from the inlined authenticated logText. */
export interface SavedCrashLogFile {
  readonly path: string;
  readonly bytesWritten: number;
}

export type FeedbackKind = "crash" | "screenshot";

/** One submission's outcome inside a batch (continue-on-error). */
export interface FeedbackDownloadItem {
  readonly id: string;
  readonly kind: FeedbackKind;
  readonly savedFiles: readonly SavedScreenshotFile[];
  /** True when there was nothing to download (e.g. no screenshots, empty log). */
  readonly skipped: boolean;
  /** Per-item failure message; the batch still proceeds. */
  readonly error?: string;
}

export interface FeedbackDownloadSummary {
  readonly submissions: readonly FeedbackDownloadItem[];
  readonly totals: {
    readonly files: number;
    readonly bytes: number;
  };
}

export interface DownloadFeedbackAttachmentsOptions {
  /** Transport retry tuning for the auth-free CDN fetch; tests shrink backoff. */
  readonly retry?: RetryOptions;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Origin + path of a signed URL; the query (secret) is dropped for the
 * envelope. The single de-querying primitive for the feedback leak path —
 * both this workflow and the CLI (get-screenshot / list-screenshots) import
 * it so a signed URL is sanitized in exactly one place. Returns undefined for
 * an unparseable URL so a caller can drop the field rather than echo garbage.
 */
export function sanitizeScreenshotUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    return undefined;
  }
}

const IMAGE_EXTENSION_BY_PATH = /\.(png|jpe?g|heic|heif|gif|webp)$/i;

/**
 * Synthesizes an extension for a feedback screenshot. The image carries no
 * fileName, so the URL path is the only hint; default to .png when nothing
 * is recognizable. live-verify (实机核实 #18): the actual binary format
 * (PNG/JPEG/HEIC) and whether the path even carries an extension — refine the
 * sniff once observed.
 */
function screenshotExtension(url: string): string {
  try {
    const parsed = new URL(url);
    const match = IMAGE_EXTENSION_BY_PATH.exec(parsed.pathname);
    const captured = match?.[1];
    if (captured !== undefined) {
      return captured.toLowerCase().replace("jpeg", "jpg");
    }
  } catch {
    // Not a parseable URL; fall through to the default extension.
  }
  return "png";
}

/** `screenshot-<submissionId>-<index>.<ext>`, zero-padded for sorted listings. */
function screenshotFileName(
  submissionId: string,
  index: number,
  url: string,
): string {
  return `screenshot-${submissionId}-${String(index).padStart(2, "0")}.${screenshotExtension(url)}`;
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    throw new AscFileProcessingError(
      `Creating the output directory ${dir} failed: ${messageOf(error)}`,
      "write",
      { target: dir, cause: error },
    );
  }
}

/**
 * Downloads every screenshot in a screenshot feedback submission to disk via
 * the auth-free binary branch. Images are processed in array order; each one
 * checks for a URL (an image without a URL is an upstream gap) and reports its
 * expirationDate. The returned files NEVER include the signed URL — only the
 * de-queried URL, bytes, width/height, and expirationDate.
 */
export async function downloadScreenshotFeedbackAttachments(
  client: AscClient,
  submissionId: string,
  outputDir: string,
  options: DownloadFeedbackAttachmentsOptions = {},
): Promise<readonly SavedScreenshotFile[]> {
  const submission = await getScreenshotFeedback(client, submissionId);
  const images: readonly BetaFeedbackScreenshotImage[] =
    submission.data.attributes?.screenshots ?? [];
  if (images.length === 0) {
    throw new AscNotFoundError(
      `Screenshot feedback ${submissionId} carries no screenshots.`,
    );
  }
  await ensureDir(outputDir);

  const saved: SavedScreenshotFile[] = [];
  for (const [index, image] of images.entries()) {
    const { url } = image;
    if (url === undefined) {
      throw new AscFileProcessingError(
        `Screenshot ${String(index)} of feedback ${submissionId} carries no URL.`,
        "download",
      );
    }
    // Proactive expiration gate: an already-expired signed URL would just fail
    // at the download stage after a wasted round-trip (m7-testflight.md:186).
    // Skip it (no fetch) and record why, distinct from a download error. The
    // exact expiration window is unconfirmed (live-verify #17), so this only
    // skips when the timestamp is UNAMBIGUOUSLY in the past — clock-skew but
    // still-valid URLs still attempt the fetch.
    const sanitizedUrl = sanitizeScreenshotUrl(url);
    if (image.expirationDate !== undefined) {
      const expiresAt = Date.parse(image.expirationDate);
      if (!Number.isNaN(expiresAt) && expiresAt <= Date.now()) {
        saved.push({
          skipped: true,
          reason: `signed URL expired at ${image.expirationDate}`,
          ...(image.width !== undefined && { width: image.width }),
          ...(image.height !== undefined && { height: image.height }),
          expirationDate: image.expirationDate,
          ...(sanitizedUrl !== undefined && { sanitizedUrl }),
        });
        continue;
      }
    }
    const fileName = screenshotFileName(submissionId, index, url);
    const filePath = join(outputDir, fileName);
    const result = await downloadExternalBinaryFile(url, filePath, {
      ...(options.retry !== undefined && { retry: options.retry }),
    });
    saved.push({
      path: result.path,
      bytesWritten: result.bytesWritten,
      ...(image.width !== undefined && { width: image.width }),
      ...(image.height !== undefined && { height: image.height }),
      ...(image.expirationDate !== undefined && {
        expirationDate: image.expirationDate,
      }),
      ...(sanitizedUrl !== undefined && { sanitizedUrl }),
    });
  }
  return saved;
}

/**
 * Decodes a crash log's inlined text defensively before writing. The contract
 * types logText as a plain string, but its real encoding is unverified
 * (live-verify #15): it may be base64-wrapped gzip, or base64 text, or plain.
 * gzip magic (after a base64 decode) is decompressed; otherwise the original
 * text is written verbatim. Plain text always survives this path unchanged.
 */
function decodeCrashLog(logText: string): Buffer {
  // Heuristic: a base64 blob is non-empty, base64-charset only, length % 4 == 0,
  // and contains no newlines (a real crash report is multi-line plain text).
  const looksBase64 =
    logText.length > 0 &&
    logText.length % 4 === 0 &&
    !logText.includes("\n") &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(logText);
  if (looksBase64) {
    const decoded = Buffer.from(logText, "base64");
    if (decoded[0] === 0x1f && decoded[1] === 0x8b) {
      try {
        return gunzipSync(decoded);
      } catch {
        // Gzip magic but undecompressable: fall back to the raw text so the
        // caller still gets evidence rather than a hard failure.
        return Buffer.from(logText, "utf8");
      }
    }
    // Base64 text that round-trips to printable UTF-8 is very likely an encoded
    // crash report; otherwise keep the raw string (it was probably real text
    // that merely happened to match the base64 charset).
    const reEncoded = decoded.toString("base64").replace(/=+$/, "");
    if (reEncoded === logText.replace(/=+$/, "")) {
      const utf8 = decoded.toString("utf8");
      if (!utf8.includes("�")) {
        return Buffer.from(utf8, "utf8");
      }
    }
  }
  return Buffer.from(logText, "utf8");
}

/**
 * Writes a crash submission's inlined crash log to disk. Unlike screenshots
 * this is NOT a signed-URL download: the log text rides in the authenticated
 * JSON, so the "download" is reading the property and writing it locally. A
 * write failure maps to the `write` file-processing stage.
 */
export async function downloadCrashFeedbackLog(
  client: AscClient,
  submissionId: string,
  outputDir: string,
): Promise<SavedCrashLogFile> {
  const log = await getCrashLog(client, submissionId);
  const logText = log.data.attributes?.logText;
  if (logText === undefined || logText === "") {
    throw new AscNotFoundError(
      `Crash feedback ${submissionId} has no crash log text.`,
    );
  }
  await ensureDir(outputDir);

  const bytes = decodeCrashLog(logText);
  const filePath = join(outputDir, `crash-${submissionId}.crash`);
  try {
    await writeFile(filePath, bytes);
  } catch (error) {
    throw new AscFileProcessingError(
      `Writing the crash log ${filePath} failed: ${messageOf(error)}`,
      "write",
      { target: filePath, cause: error },
    );
  }
  return { path: filePath, bytesWritten: bytes.length };
}

export interface DownloadFeedbackTarget {
  /** A single submission id (its kind must be supplied alongside). */
  readonly id?: string;
  readonly kind?: FeedbackKind;
  /** Or enumerate an app's feedback. `kinds` selects crash/screenshot/both. */
  readonly appId?: string;
  readonly kinds?: readonly FeedbackKind[];
  /** Filters for the app-scoped enumeration (build/tester/device/os/sort). */
  readonly listOptions?: Omit<ListFeedbackOptions, "scope" | "pagination">;
  /** Read scope for the enumeration; defaults to single-page. */
  readonly scope?: ListFeedbackOptions["scope"];
}

interface ResolvedSubmission {
  readonly id: string;
  readonly kind: FeedbackKind;
}

async function resolveSubmissions(
  client: AscClient,
  target: DownloadFeedbackTarget,
): Promise<ResolvedSubmission[]> {
  if (target.id !== undefined) {
    if (target.kind === undefined) {
      throw new AscFileProcessingError(
        "A single feedback id requires its kind (crash or screenshot).",
        "download",
      );
    }
    return [{ id: target.id, kind: target.kind }];
  }
  if (target.appId === undefined) {
    throw new AscFileProcessingError(
      "Provide either a submission id (+ kind) or an appId to enumerate.",
      "download",
    );
  }
  const kinds = target.kinds ?? ["crash", "screenshot"];
  const scope = target.scope ?? "single-page";
  const listOptions = target.listOptions ?? {};
  const resolved: ResolvedSubmission[] = [];
  if (kinds.includes("crash")) {
    const crashes = await listCrashFeedback(client, target.appId, {
      ...listOptions,
      scope,
    });
    for (const item of crashes.items) {
      resolved.push({ id: item.id, kind: "crash" });
    }
  }
  if (kinds.includes("screenshot")) {
    const shots = await listScreenshotFeedback(client, target.appId, {
      ...listOptions,
      scope,
    });
    for (const item of shots.items) {
      resolved.push({ id: item.id, kind: "screenshot" });
    }
  }
  return resolved;
}

/**
 * One-shot orchestration: resolve the target submission(s), download each one's
 * attachment(s), and return a structured summary. CONTINUE-ON-ERROR: a per-item
 * failure (most often an expired signed URL) is recorded on that item's `error`
 * and the batch proceeds — one bad attachment never sinks the whole run. The
 * summary never contains a signed URL, only on-disk paths, bytes, dimensions,
 * expirationDate, and de-queried sanitized URLs.
 */
export async function downloadFeedbackAttachments(
  client: AscClient,
  target: DownloadFeedbackTarget,
  outputDir: string,
  options: DownloadFeedbackAttachmentsOptions = {},
): Promise<FeedbackDownloadSummary> {
  const submissions = await resolveSubmissions(client, target);
  const items: FeedbackDownloadItem[] = [];
  let totalFiles = 0;
  let totalBytes = 0;

  for (const submission of submissions) {
    try {
      if (submission.kind === "screenshot") {
        const saved = await downloadScreenshotFeedbackAttachments(
          client,
          submission.id,
          outputDir,
          options,
        );
        // Skipped images (expired URL, no fetch) ride in savedFiles for the
        // detail but contribute no file/bytes to the totals.
        const written = saved.filter((file) => file.skipped !== true);
        totalFiles += written.length;
        totalBytes += written.reduce(
          (sum, file) => sum + (file.bytesWritten ?? 0),
          0,
        );
        items.push({
          id: submission.id,
          kind: "screenshot",
          savedFiles: saved,
          // A submission whose only images were all skipped lands nothing.
          skipped: written.length === 0,
        });
      } else {
        const saved = await downloadCrashFeedbackLog(
          client,
          submission.id,
          outputDir,
        );
        totalFiles += 1;
        totalBytes += saved.bytesWritten;
        items.push({
          id: submission.id,
          kind: "crash",
          // A crash log is recorded as a screenshot-shaped file entry (path +
          // bytes) so the summary has a single uniform savedFiles shape.
          savedFiles: [{ path: saved.path, bytesWritten: saved.bytesWritten }],
          skipped: false,
        });
      }
    } catch (error) {
      if (error instanceof AscNotFoundError) {
        // "Nothing to download" is a skip, not a failure.
        items.push({
          id: submission.id,
          kind: submission.kind,
          savedFiles: [],
          skipped: true,
        });
        continue;
      }
      items.push({
        id: submission.id,
        kind: submission.kind,
        savedFiles: [],
        skipped: false,
        error: messageOf(error),
      });
    }
  }

  return {
    submissions: items,
    totals: { files: totalFiles, bytes: totalBytes },
  };
}
