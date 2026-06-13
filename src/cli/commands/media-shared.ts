// Kind-agnostic pieces shared by the screenshots and previews command trees:
// the common flag fragments and the result→envelope field builders. The
// envelope shape is the part most prone to drift between the two near-parallel
// trees, so it lives here and is exercised once. Everything kind-specific (the
// display-type/preview-type validators, the workflow functions wired in, the
// extra preview flags) stays in the two command files.

import type { ArgsDef } from "citty";

import type {
  MediaAssetStatusResult,
  MediaUploadResult,
  MediaUploadSetResult,
} from "../../workflows/media-assets.js";
import { resolveTimeoutMs } from "../media-flags.js";

export const versionLocaleArgs = {
  version: {
    type: "string",
    required: true,
    valueHint: "versionId",
    description: "The App Store version's ASC id (from 'asc versions list')",
  },
  locale: {
    type: "string",
    required: true,
    valueHint: "en-US",
    description: "The localization's locale (BCP-47)",
  },
} as const satisfies ArgsDef;

export const setArg = {
  set: {
    type: "string",
    required: true,
    valueHint: "setId",
    description: "The set's ASC id (from 'list-sets')",
  },
} as const satisfies ArgsDef;

export const waitTimeoutArgs = {
  wait: {
    type: "boolean",
    default: true,
    description:
      "Wait (poll) until Apple finishes processing; pass --no-wait to return right after the commit",
  },
  timeout: {
    type: "string",
    valueHint: "60",
    description:
      "Max seconds to wait for processing (default: screenshots 60, previews 600)",
  },
} as const satisfies ArgsDef;

export interface WaitTimeoutFlags {
  readonly wait?: boolean | undefined;
  readonly timeout?: string | undefined;
}

/** Translates the wait/timeout flags into the workflow's poll options. */
export function resolveWaitTimeout(flags: WaitTimeoutFlags): {
  readonly wait: boolean;
  readonly pollTimeoutMs?: number;
} {
  const pollTimeoutMs = resolveTimeoutMs(flags.timeout);
  return {
    wait: flags.wait !== false,
    ...(pollTimeoutMs !== undefined && { pollTimeoutMs }),
  };
}

/**
 * The asset-derived fields of an upload's `resolved` block. When processing did
 * not finish in time, `statusCommand` points at the status verb so the caller
 * can resume the check — the bytes are already uploaded.
 */
export function uploadResultFields(
  result: MediaUploadResult<unknown>,
  statusCommandBase: string,
): Record<string, unknown> {
  return {
    assetId: result.assetId,
    fileName: result.fileName,
    fileSize: result.fileSize,
    md5: result.md5,
    operationCount: result.operationCount,
    bytesTransferred: result.bytesTransferred,
    finalState: result.finalState,
    complete: result.complete,
    ...(result.pollTimedOut && {
      pollTimedOut: true,
      statusCommand: `${statusCommandBase} ${result.assetId}`,
    }),
  };
}

/** The `resolved` block for a status read. */
export function statusResultFields(
  result: MediaAssetStatusResult<unknown>,
): Record<string, unknown> {
  return {
    assetId: result.assetId,
    finalState: result.finalState,
    complete: result.complete,
    failed: result.failed,
    ...(result.errors.length > 0 && { errors: result.errors }),
    ...(result.pollTimedOut && { pollTimedOut: true }),
  };
}

/** The `resolved` block for a whole-set upload: per-asset summary + ordering. */
export function uploadSetResultFields(
  result: MediaUploadSetResult<unknown>,
  statusCommandBase: string,
): Record<string, unknown> {
  return {
    setId: result.setId,
    setCreated: result.setCreated,
    count: result.uploads.length,
    assets: result.uploads.map((upload) => ({
      assetId: upload.assetId,
      fileName: upload.fileName,
      fileSize: upload.fileSize,
      finalState: upload.finalState,
      complete: upload.complete,
      ...(upload.pollTimedOut && { pollTimedOut: true }),
    })),
    ...(result.order !== undefined && { order: result.order }),
    ...(result.uploads.some((upload) => upload.pollTimedOut) && {
      statusCommand: statusCommandBase,
    }),
  };
}
