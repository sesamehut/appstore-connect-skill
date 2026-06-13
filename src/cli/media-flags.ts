import { stat } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";

import type { PreviewType } from "../capabilities/app-previews.js";
import type { ScreenshotDisplayType } from "../capabilities/app-screenshots.js";
import { CliUsageError } from "./exit-codes.js";
import { csvList, parsePositiveInt } from "./read-scope.js";

/**
 * The display types Apple's API accepts. Validated locally (unlike most enum
 * flags, which pass through to ASC) because the find-or-create step matches a
 * set by this exact value before any request resolves — a typo must fail as a
 * clear usage error, not as a confusing set-creation rejection. `satisfies`
 * keeps the list from drifting past a value Apple has removed; Apple remains
 * authoritative, so a brand-new device class missing here means regenerate the
 * contract.
 */
const SCREENSHOT_DISPLAY_TYPES = [
  "APP_IPHONE_67",
  "APP_IPHONE_61",
  "APP_IPHONE_65",
  "APP_IPHONE_58",
  "APP_IPHONE_55",
  "APP_IPHONE_47",
  "APP_IPHONE_40",
  "APP_IPHONE_35",
  "APP_IPAD_PRO_3GEN_129",
  "APP_IPAD_PRO_3GEN_11",
  "APP_IPAD_PRO_129",
  "APP_IPAD_105",
  "APP_IPAD_97",
  "APP_DESKTOP",
  "APP_WATCH_ULTRA",
  "APP_WATCH_SERIES_10",
  "APP_WATCH_SERIES_7",
  "APP_WATCH_SERIES_4",
  "APP_WATCH_SERIES_3",
  "APP_APPLE_TV",
  "APP_APPLE_VISION_PRO",
  "IMESSAGE_APP_IPHONE_67",
  "IMESSAGE_APP_IPHONE_61",
  "IMESSAGE_APP_IPHONE_65",
  "IMESSAGE_APP_IPHONE_58",
  "IMESSAGE_APP_IPHONE_55",
  "IMESSAGE_APP_IPHONE_47",
  "IMESSAGE_APP_IPHONE_40",
  "IMESSAGE_APP_IPAD_PRO_3GEN_129",
  "IMESSAGE_APP_IPAD_PRO_3GEN_11",
  "IMESSAGE_APP_IPAD_PRO_129",
  "IMESSAGE_APP_IPAD_105",
  "IMESSAGE_APP_IPAD_97",
] as const satisfies readonly ScreenshotDisplayType[];

const PREVIEW_TYPES = [
  "IPHONE_67",
  "IPHONE_61",
  "IPHONE_65",
  "IPHONE_58",
  "IPHONE_55",
  "IPHONE_47",
  "IPHONE_40",
  "IPHONE_35",
  "IPAD_PRO_3GEN_129",
  "IPAD_PRO_3GEN_11",
  "IPAD_PRO_129",
  "IPAD_105",
  "IPAD_97",
  "DESKTOP",
  "APPLE_TV",
  "APPLE_VISION_PRO",
] as const satisfies readonly PreviewType[];

export function resolveScreenshotDisplayType(
  raw: string | undefined,
): ScreenshotDisplayType {
  if (raw === undefined) {
    throw new CliUsageError(
      "--display-type is required; see 'asc media screenshots upload --help' for the device list.",
    );
  }
  if ((SCREENSHOT_DISPLAY_TYPES as readonly string[]).includes(raw)) {
    return raw as ScreenshotDisplayType;
  }
  throw new CliUsageError(
    `--display-type "${raw}" is not a known screenshot display type. Apple's API is authoritative; the values this build knows are: ${SCREENSHOT_DISPLAY_TYPES.join(", ")}.`,
  );
}

export function resolvePreviewType(raw: string | undefined): PreviewType {
  if (raw === undefined) {
    throw new CliUsageError(
      "--preview-type is required; see 'asc media previews upload --help' for the device list.",
    );
  }
  if ((PREVIEW_TYPES as readonly string[]).includes(raw)) {
    return raw as PreviewType;
  }
  throw new CliUsageError(
    `--preview-type "${raw}" is not a known preview type. Apple's API is authoritative; the values this build knows are: ${PREVIEW_TYPES.join(", ")}.`,
  );
}

/** Apple's poster-frame timecode is HH:MM:SS with an optional millisecond part. */
const FRAME_TIME_CODE = /^\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/;

export function validateFrameTimeCode(raw: string | undefined): void {
  if (raw === undefined) {
    return;
  }
  if (!FRAME_TIME_CODE.test(raw)) {
    throw new CliUsageError(
      `--frame-time-code must be HH:MM:SS or HH:MM:SS.mmm, got "${raw}".`,
    );
  }
}

const SCREENSHOT_EXTENSIONS: readonly string[] = [".png", ".jpg", ".jpeg"];
const PREVIEW_EXTENSIONS: readonly string[] = [".mov", ".mp4", ".m4v"];

export { SCREENSHOT_EXTENSIONS, PREVIEW_EXTENSIONS };

/**
 * Pre-flight check that a `--file` argument names a readable regular file, so a
 * missing path fails fast as a usage error (exit 64) rather than surfacing
 * later as a transfer-read error mid-upload. The byte size is read here too,
 * but the upload workflow re-reads it itself — the caller never supplies it.
 */
export async function statInputFile(
  path: string,
  flag = "--file",
): Promise<void> {
  let info;
  try {
    info = await stat(path);
  } catch {
    throw new CliUsageError(
      `${flag} path does not exist or is not readable: ${path}`,
    );
  }
  if (!info.isFile()) {
    throw new CliUsageError(`${flag} must be a regular file: ${path}`);
  }
}

/**
 * Enumerates a `--dir` of media files of the allowed extensions, sorted by name
 * so the upload order is deterministic (and the default screenshot/preview
 * order matches the on-disk naming). Empty or missing directories fail as usage
 * errors before any request is sent.
 */
export async function readMediaDirectory(
  dir: string,
  extensions: readonly string[],
  flag = "--dir",
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    throw new CliUsageError(
      `${flag} path does not exist or is not a readable directory: ${dir}`,
    );
  }
  const files = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        extensions.includes(extname(entry.name).toLowerCase()),
    )
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => join(dir, name));
  if (files.length === 0) {
    throw new CliUsageError(
      `${flag} contains no ${extensions.join("/")} files: ${dir}`,
    );
  }
  return files;
}

/**
 * Parses a `--order` list of asset ids: non-empty, comma-separated, no
 * duplicates. A duplicate would make the reorder's membership list invalid, so
 * it is caught here with a clearer message than ASC's relationship rejection.
 */
export function parseOrderList(raw: string | undefined): string[] {
  const ids = csvList(raw);
  if (ids === undefined || ids.length === 0) {
    throw new CliUsageError(
      "--order expects a comma-separated list of asset ids.",
    );
  }
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new CliUsageError(`--order lists "${id}" more than once.`);
    }
    seen.add(id);
  }
  return ids;
}

/** Converts a `--timeout` flag (whole seconds) into the workflow's millis. */
export function resolveTimeoutMs(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  return parsePositiveInt(raw, "--timeout") * 1000;
}
