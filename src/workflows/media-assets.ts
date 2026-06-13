import { basename } from "node:path";

import {
  commitAppScreenshot,
  createAppScreenshotSet,
  getAppScreenshot,
  listAppScreenshots,
  listAppScreenshotSets,
  readScreenshotDeliveryState,
  reorderAppScreenshots,
  reserveAppScreenshot,
} from "../capabilities/app-screenshots.js";
import type {
  AppScreenshotResponse,
  AppScreenshotSet,
  ScreenshotDisplayType,
} from "../capabilities/app-screenshots.js";
import {
  commitAppPreview,
  createAppPreviewSet,
  getAppPreview,
  listAppPreviews,
  listAppPreviewSets,
  readPreviewDeliveryStates,
  reorderAppPreviews,
  reserveAppPreview,
} from "../capabilities/app-previews.js";
import type {
  AppPreviewResponse,
  AppPreviewSet,
  PreviewType,
} from "../capabilities/app-previews.js";
import { listAppStoreVersionLocalizations } from "../capabilities/app-store-version-localizations.js";
import type { AppStoreVersionLocalization } from "../capabilities/app-store-version-localizations.js";
import {
  AscFileProcessingError,
  AscNotFoundError,
  AscUpstreamError,
} from "../errors.js";
import type { AscClient } from "../http/client.js";
import {
  computeFileMd5,
  readUploadFileMetadata,
  uploadFileParts,
} from "./media-files.js";
import type {
  UploadFileMetadata,
  UploadFilePartsOptions,
  UploadPartOperation,
} from "./media-files.js";

// ---------------------------------------------------------------------------
// Localization resolution (version + locale → appStoreVersionLocalization)
// ---------------------------------------------------------------------------

export interface ResolvedLocalization {
  readonly localizationId: string;
  readonly locale: string;
  readonly localization: AppStoreVersionLocalization;
}

/**
 * Resolves the (versionId, locale) pair callers think in to the
 * appStoreVersionLocalization id that screenshot/preview sets attach to. A
 * miss answers with the locales that DO exist, mirroring the analytics
 * resolver's "here is what is available" diagnostic.
 */
export async function resolveLocalization(
  client: AscClient,
  versionId: string,
  locale: string,
): Promise<ResolvedLocalization> {
  const read = await listAppStoreVersionLocalizations(client, versionId, {
    scope: "all-pages",
    locale: [locale],
  });
  const match = read.items[0];
  if (match === undefined) {
    const all = await listAppStoreVersionLocalizations(client, versionId, {
      scope: "all-pages",
    });
    const locales = all.items.flatMap((item) =>
      item.attributes?.locale === undefined ? [] : [item.attributes.locale],
    );
    throw new AscNotFoundError(
      `Version ${versionId} has no "${locale}" localization.${
        locales.length > 0
          ? ` Available locales: ${locales.join(", ")}.`
          : " It has no localizations yet — add one with 'asc metadata version add-locale'."
      }`,
    );
  }
  return {
    localizationId: match.id,
    locale: match.attributes?.locale ?? locale,
    localization: match,
  };
}

// ---------------------------------------------------------------------------
// Set find-or-create (idempotent, mirrors ensureAnalyticsReportRequest)
// ---------------------------------------------------------------------------

export interface EnsureScreenshotSetResult {
  readonly set: AppScreenshotSet;
  /** False when an existing set of this display type was reused. */
  readonly created: boolean;
}

/**
 * Finds the localization's screenshot set for a display type, or creates one.
 * Lists via the localization's related read so the match is scoped to this
 * localization, never a global set list. The set is the upload target; a
 * localization holds at most one set per display type.
 */
export async function ensureScreenshotSet(
  client: AscClient,
  localizationId: string,
  displayType: ScreenshotDisplayType,
): Promise<EnsureScreenshotSetResult> {
  const existing = await listAppScreenshotSets(client, localizationId, {
    scope: "all-pages",
  });
  const match = existing.items.find(
    (set) => set.attributes?.screenshotDisplayType === displayType,
  );
  if (match !== undefined) {
    return { set: match, created: false };
  }
  const created = await createAppScreenshotSet(
    client,
    localizationId,
    displayType,
  );
  return { set: created.data, created: true };
}

export interface EnsurePreviewSetResult {
  readonly set: AppPreviewSet;
  readonly created: boolean;
}

/** The preview twin of ensureScreenshotSet, matching on previewType. */
export async function ensurePreviewSet(
  client: AscClient,
  localizationId: string,
  previewType: PreviewType,
): Promise<EnsurePreviewSetResult> {
  const existing = await listAppPreviewSets(client, localizationId, {
    scope: "all-pages",
  });
  const match = existing.items.find(
    (set) => set.attributes?.previewType === previewType,
  );
  if (match !== undefined) {
    return { set: match, created: false };
  }
  const created = await createAppPreviewSet(
    client,
    localizationId,
    previewType,
  );
  return { set: created.data, created: true };
}

// ---------------------------------------------------------------------------
// Upload engine (reserve → transfer → commit → confirm), kind-agnostic
// ---------------------------------------------------------------------------

interface MediaStateError {
  readonly code?: string;
  readonly description?: string;
}

interface AssetClassification {
  readonly state: "complete" | "failed" | "pending";
  /** Apple's state errors when failed. */
  readonly errors: readonly MediaStateError[];
  /** A short human label of the current delivery phase, for the envelope. */
  readonly detail: string;
}

/**
 * The single parameterization seam between the screenshot and preview flows.
 * The engine never branches on asset kind — it calls these methods, which the
 * two builders below supply. Only `extract`'s `classification` differs in
 * substance (previews must also clear `videoDeliveryState`).
 */
interface MediaAssetOps<Resource> {
  readonly kind: "screenshot" | "preview";
  reserve(setId: string, fileMeta: UploadFileMetadata): Promise<Resource>;
  commit(assetId: string, md5: string): Promise<Resource>;
  get(assetId: string): Promise<Resource>;
  extract(resource: Resource): {
    readonly id: string;
    readonly uploadOperations: readonly UploadPartOperation[] | undefined;
    readonly classification: AssetClassification;
  };
}

export interface MediaUploadOptions extends MediaPollOptions {
  /**
   * `wait` defaults to true here: the upload flow blocks until COMPLETE/FAILED
   * unless told otherwise, in which case it returns right after the commit with
   * the not-yet-complete state for a later status check.
   *
   * Transfer (ranged PUT) retry tuning and fetch seam.
   */
  readonly transfer?: UploadFilePartsOptions;
}

export interface MediaUploadResult<Resource> {
  readonly assetId: string;
  readonly fileName: string;
  readonly fileSize: number;
  /** Whole-file MD5 sent as the commit checksum. */
  readonly md5: string;
  readonly operationCount: number;
  readonly bytesTransferred: number;
  /** The final asset resource document, for the result envelope's `data`. */
  readonly resource: Resource;
  /** Apple's last-observed delivery-state label. */
  readonly finalState: string;
  /** True once Apple reported COMPLETE. */
  readonly complete: boolean;
  /** True when polling hit its budget while the asset was still processing. */
  readonly pollTimedOut: boolean;
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function formatStateErrors(errors: readonly MediaStateError[]): string {
  if (errors.length === 0) {
    return "no error detail was provided by Apple";
  }
  return errors
    .map((error) => `${error.code ?? "?"}: ${error.description ?? "?"}`)
    .join("; ");
}

/** Shared polling knobs; defaults differ by kind (video transcode is slow). */
export interface MediaPollOptions {
  /** Poll until terminal (default depends on caller). */
  readonly wait?: boolean;
  /** Total polling budget in ms. Defaults: screenshots 60s, previews 600s. */
  readonly pollTimeoutMs?: number;
  /** Delay between polls in ms. Defaults: screenshots 2s, previews 5s. */
  readonly pollIntervalMs?: number;
  /** Test seam: replaces the inter-poll delay (and makes polling instant). */
  readonly sleep?: (ms: number) => Promise<void>;
}

function pollTuning(
  kind: "screenshot" | "preview",
  options: MediaPollOptions,
): {
  intervalMs: number;
  maxAttempts: number;
  sleep: (ms: number) => Promise<void>;
} {
  const intervalMs =
    options.pollIntervalMs ?? (kind === "preview" ? 5000 : 2000);
  const timeoutMs =
    options.pollTimeoutMs ?? (kind === "preview" ? 600000 : 60000);
  return {
    intervalMs,
    maxAttempts: Math.max(1, Math.ceil(timeoutMs / intervalMs)),
    sleep: options.sleep ?? defaultSleep,
  };
}

interface PollOutcome<Resource> {
  readonly resource: Resource;
  readonly classification: AssetClassification;
  /** True when the budget ran out while the asset was still processing. */
  readonly pollTimedOut: boolean;
}

/**
 * Polls `ops.get` until the asset reaches a terminal state or the budget runs
 * out. Shared by the upload flow (which polls from the commit response) and the
 * status verb (which polls from a fresh read). Never throws on FAILED — the
 * terminal classification is returned for the caller to act on.
 */
async function pollUntilTerminal<Resource>(
  ops: MediaAssetOps<Resource>,
  assetId: string,
  initial: PollOutcome<Resource>["resource"],
  initialClassification: AssetClassification,
  options: MediaPollOptions,
): Promise<PollOutcome<Resource>> {
  let resource = initial;
  let classification = initialClassification;
  if (options.wait === false) {
    return { resource, classification, pollTimedOut: false };
  }
  const { intervalMs, maxAttempts, sleep } = pollTuning(ops.kind, options);
  let attempt = 0;
  while (classification.state === "pending" && attempt < maxAttempts) {
    await sleep(intervalMs);
    resource = await ops.get(assetId);
    classification = ops.extract(resource).classification;
    attempt += 1;
  }
  return {
    resource,
    classification,
    pollTimedOut: classification.state === "pending",
  };
}

const PREVIEW_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
};

/**
 * Maps a preview file's extension to the mimeType Apple expects at reservation.
 * Unknown extensions return undefined so the reservation omits the field rather
 * than guessing; callers may override with an explicit mimeType.
 */
export function inferPreviewMimeType(fileName: string): string | undefined {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) {
    return undefined;
  }
  return PREVIEW_MIME_BY_EXTENSION[fileName.slice(dot).toLowerCase()];
}

async function runMediaUpload<Resource>(
  ops: MediaAssetOps<Resource>,
  setId: string,
  filePath: string,
  options: MediaUploadOptions,
): Promise<MediaUploadResult<Resource>> {
  // Read inputs and hash up front: a local-file problem fails as transfer-read
  // before any ASC mutation, never leaving a dangling reservation behind.
  const fileMeta = await readUploadFileMetadata(filePath);
  const md5 = await computeFileMd5(filePath);

  const reserved = await ops.reserve(setId, fileMeta);
  const reservedInfo = ops.extract(reserved);
  const operations = reservedInfo.uploadOperations;
  if (operations === undefined || operations.length === 0) {
    throw new AscUpstreamError(
      `Apple reserved ${ops.kind} ${reservedInfo.id} but returned no upload operations; cannot upload.`,
    );
  }
  const transfer = await uploadFileParts(
    filePath,
    operations,
    options.transfer ?? {},
  );

  const committed = await ops.commit(reservedInfo.id, md5);
  const polled = await pollUntilTerminal(
    ops,
    reservedInfo.id,
    committed,
    ops.extract(committed).classification,
    options,
  );

  if (polled.classification.state === "failed") {
    // The bytes transferred fine; Apple's async processing rejected the
    // content (wrong dimensions, bad codec). Distinct from a `transfer`
    // failure so the interrupted-flow stage stays diagnosable.
    throw new AscFileProcessingError(
      `Apple's processing of ${ops.kind} ${reservedInfo.id} reported FAILED: ${formatStateErrors(polled.classification.errors)}`,
      "processing",
      { target: reservedInfo.id },
    );
  }

  return {
    assetId: reservedInfo.id,
    fileName: fileMeta.fileName,
    fileSize: fileMeta.fileSize,
    md5,
    operationCount: transfer.operationCount,
    bytesTransferred: transfer.bytesTransferred,
    resource: polled.resource,
    finalState: polled.classification.detail,
    complete: polled.classification.state === "complete",
    pollTimedOut: polled.pollTimedOut,
  };
}

function classifyScreenshot(
  resource: AppScreenshotResponse,
): AssetClassification {
  const delivery = readScreenshotDeliveryState(resource);
  const state = delivery?.state;
  if (state === "FAILED") {
    return {
      state: "failed",
      errors: delivery?.errors ?? [],
      detail: "assetDeliveryState FAILED",
    };
  }
  if (state === "COMPLETE") {
    return { state: "complete", errors: [], detail: "COMPLETE" };
  }
  return {
    state: "pending",
    errors: [],
    detail: `assetDeliveryState ${state ?? "UNKNOWN"}`,
  };
}

function classifyPreview(resource: AppPreviewResponse): AssetClassification {
  const { asset, video } = readPreviewDeliveryStates(resource);
  if (asset?.state === "FAILED") {
    return {
      state: "failed",
      errors: asset.errors ?? [],
      detail: "assetDeliveryState FAILED",
    };
  }
  if (video?.state === "FAILED") {
    return {
      state: "failed",
      errors: video.errors ?? [],
      detail: "videoDeliveryState FAILED",
    };
  }
  // A preview is only done when both the upload AND the transcode complete.
  if (asset?.state === "COMPLETE" && video?.state === "COMPLETE") {
    return { state: "complete", errors: [], detail: "COMPLETE" };
  }
  return {
    state: "pending",
    errors: [],
    detail: `asset ${asset?.state ?? "UNKNOWN"} / video ${video?.state ?? "UNKNOWN"}`,
  };
}

function screenshotOps(
  client: AscClient,
): MediaAssetOps<AppScreenshotResponse> {
  return {
    kind: "screenshot",
    reserve: (setId, fileMeta) =>
      reserveAppScreenshot(client, setId, {
        fileName: fileMeta.fileName,
        fileSize: fileMeta.fileSize,
      }),
    commit: (assetId, md5) =>
      commitAppScreenshot(client, assetId, {
        uploaded: true,
        sourceFileChecksum: md5,
      }),
    get: (assetId) => getAppScreenshot(client, assetId),
    extract: (resource) => ({
      id: resource.data.id,
      uploadOperations: resource.data.attributes?.uploadOperations,
      classification: classifyScreenshot(resource),
    }),
  };
}

interface PreviewReserveExtras {
  readonly mimeType?: string;
  readonly previewFrameTimeCode?: string;
}

function previewOps(
  client: AscClient,
  extras: PreviewReserveExtras,
): MediaAssetOps<AppPreviewResponse> {
  return {
    kind: "preview",
    reserve: (setId, fileMeta) =>
      reserveAppPreview(client, setId, {
        fileName: fileMeta.fileName,
        fileSize: fileMeta.fileSize,
        ...(extras.mimeType !== undefined && { mimeType: extras.mimeType }),
        ...(extras.previewFrameTimeCode !== undefined && {
          previewFrameTimeCode: extras.previewFrameTimeCode,
        }),
      }),
    commit: (assetId, md5) =>
      commitAppPreview(client, assetId, {
        uploaded: true,
        sourceFileChecksum: md5,
      }),
    get: (assetId) => getAppPreview(client, assetId),
    extract: (resource) => ({
      id: resource.data.id,
      uploadOperations: resource.data.attributes?.uploadOperations,
      classification: classifyPreview(resource),
    }),
  };
}

/**
 * Uploads one screenshot to a set: reserve → transfer the bytes to the
 * pre-signed URLs → commit with the checksum → confirm COMPLETE. A terminal
 * FAILED throws a processing-stage error; a poll timeout returns with
 * `pollTimedOut` set so the caller can point at the status verb.
 */
export function uploadScreenshot(
  client: AscClient,
  setId: string,
  filePath: string,
  options: MediaUploadOptions = {},
): Promise<MediaUploadResult<AppScreenshotResponse>> {
  return runMediaUpload(screenshotOps(client), setId, filePath, options);
}

export interface UploadPreviewOptions extends MediaUploadOptions {
  readonly mimeType?: string;
  /** Poster-frame timecode (HH:MM:SS[.fff]); Apple validates it lies in-video. */
  readonly previewFrameTimeCode?: string;
}

/**
 * Uploads one preview to a set. Beyond the screenshot flow, confirmation also
 * waits on the video transcode (`videoDeliveryState`), which can take minutes —
 * hence the longer default poll budget.
 */
export function uploadPreview(
  client: AscClient,
  setId: string,
  filePath: string,
  options: UploadPreviewOptions = {},
): Promise<MediaUploadResult<AppPreviewResponse>> {
  const { mimeType, previewFrameTimeCode, ...uploadOptions } = options;
  // Infer the mimeType from the extension when the caller did not set one, so a
  // batch of mixed .mov/.mp4 files each reserves with the right type.
  const resolvedMimeType = mimeType ?? inferPreviewMimeType(basename(filePath));
  return runMediaUpload(
    previewOps(client, {
      ...(resolvedMimeType !== undefined && { mimeType: resolvedMimeType }),
      ...(previewFrameTimeCode !== undefined && { previewFrameTimeCode }),
    }),
    setId,
    filePath,
    uploadOptions,
  );
}

// ---------------------------------------------------------------------------
// Status (read the current delivery state, optionally poll to terminal)
// ---------------------------------------------------------------------------

export interface MediaAssetStatusResult<Resource> {
  readonly assetId: string;
  /** Apple's last-observed delivery-state label. */
  readonly finalState: string;
  readonly complete: boolean;
  readonly failed: boolean;
  /** Apple's state errors when failed; empty otherwise. */
  readonly errors: readonly MediaStateError[];
  /** The asset resource document, for the envelope's `data`. */
  readonly resource: Resource;
  /** True when --wait was given but the budget ran out while still processing. */
  readonly pollTimedOut: boolean;
}

async function runStatus<Resource>(
  ops: MediaAssetOps<Resource>,
  assetId: string,
  options: MediaPollOptions,
): Promise<MediaAssetStatusResult<Resource>> {
  const current = await ops.get(assetId);
  const polled = await pollUntilTerminal(
    ops,
    assetId,
    current,
    ops.extract(current).classification,
    // A status read is one-shot unless the caller explicitly opts into waiting.
    { ...options, wait: options.wait ?? false },
  );
  return {
    assetId,
    finalState: polled.classification.detail,
    complete: polled.classification.state === "complete",
    failed: polled.classification.state === "failed",
    errors: polled.classification.errors,
    resource: polled.resource,
    pollTimedOut: polled.pollTimedOut,
  };
}

/** Reads a screenshot's delivery state; `--wait` polls it to a terminal state. */
export function getScreenshotStatus(
  client: AscClient,
  assetId: string,
  options: MediaPollOptions = {},
): Promise<MediaAssetStatusResult<AppScreenshotResponse>> {
  return runStatus(screenshotOps(client), assetId, options);
}

/** Reads a preview's delivery + video state; `--wait` polls to a terminal state. */
export function getPreviewStatus(
  client: AscClient,
  assetId: string,
  options: MediaPollOptions = {},
): Promise<MediaAssetStatusResult<AppPreviewResponse>> {
  return runStatus(previewOps(client, {}), assetId, options);
}

// ---------------------------------------------------------------------------
// Whole-set upload (a directory of files → one set, in input order)
// ---------------------------------------------------------------------------

export interface MediaUploadSetResult<Resource> {
  readonly setId: string;
  readonly setCreated: boolean;
  /** One result per file, in the order the files were given. */
  readonly uploads: readonly MediaUploadResult<Resource>[];
  /** The final ordering applied, present only when `reorder` was requested. */
  readonly order?: readonly string[];
}

export interface UploadScreenshotSetOptions extends MediaUploadOptions {
  /** Reorder the set so this batch leads, in input order, after uploading. */
  readonly reorder?: boolean;
}

export type UploadPreviewSetOptions = UploadScreenshotSetOptions;

/**
 * Computes a full, valid reorder list that places this batch first (in input
 * order) followed by any pre-existing members. ASC rejects a partial or
 * superset list, so the order must cover exactly the set's current membership.
 */
async function batchLeadingOrder(
  batchIds: readonly string[],
  listMemberIds: () => Promise<string[]>,
): Promise<string[]> {
  const current = await listMemberIds();
  const batch = new Set(batchIds);
  return [...batchIds, ...current.filter((id) => !batch.has(id))];
}

/**
 * Uploads every file (in the given order) into the localization's screenshot
 * set for a display type, creating the set if absent. Uploads run sequentially
 * so a mid-batch failure stops cleanly with the prior assets already committed
 * (diagnosable via `list`, removable via `delete`). With `reorder`, the set is
 * reordered to lead with this batch once all uploads complete.
 */
export async function uploadScreenshotSet(
  client: AscClient,
  localizationId: string,
  displayType: ScreenshotDisplayType,
  filePaths: readonly string[],
  options: UploadScreenshotSetOptions = {},
): Promise<MediaUploadSetResult<AppScreenshotResponse>> {
  const ensured = await ensureScreenshotSet(
    client,
    localizationId,
    displayType,
  );
  const setId = ensured.set.id;
  const uploads: MediaUploadResult<AppScreenshotResponse>[] = [];
  for (const filePath of filePaths) {
    uploads.push(await uploadScreenshot(client, setId, filePath, options));
  }
  if (options.reorder !== true) {
    return { setId, setCreated: ensured.created, uploads };
  }
  const order = await batchLeadingOrder(
    uploads.map((upload) => upload.assetId),
    () =>
      listAppScreenshots(client, setId, { scope: "all-pages" }).then((read) =>
        read.items.map((item) => item.id),
      ),
  );
  await reorderAppScreenshots(client, setId, order);
  return { setId, setCreated: ensured.created, uploads, order };
}

/** The preview twin of uploadScreenshotSet; mimeType is inferred per file. */
export async function uploadPreviewSet(
  client: AscClient,
  localizationId: string,
  previewType: PreviewType,
  filePaths: readonly string[],
  options: UploadPreviewSetOptions = {},
): Promise<MediaUploadSetResult<AppPreviewResponse>> {
  const ensured = await ensurePreviewSet(client, localizationId, previewType);
  const setId = ensured.set.id;
  const uploads: MediaUploadResult<AppPreviewResponse>[] = [];
  for (const filePath of filePaths) {
    uploads.push(await uploadPreview(client, setId, filePath, options));
  }
  if (options.reorder !== true) {
    return { setId, setCreated: ensured.created, uploads };
  }
  const order = await batchLeadingOrder(
    uploads.map((upload) => upload.assetId),
    () =>
      listAppPreviews(client, setId, { scope: "all-pages" }).then((read) =>
        read.items.map((item) => item.id),
      ),
  );
  await reorderAppPreviews(client, setId, order);
  return { setId, setCreated: ensured.created, uploads, order };
}
