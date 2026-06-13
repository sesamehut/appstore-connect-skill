import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";

import { AscFileProcessingError, AscUpstreamError } from "../errors.js";
import {
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_DELAY_MS,
} from "../http/transport.js";
import type { FetchLike, RetryOptions } from "../http/transport.js";

/**
 * One upload instruction from a reservation, structurally matching the
 * contract's `UploadOperation` (every field is optional there, so each must be
 * validated before use).
 */
export interface UploadPartOperation {
  readonly url?: string;
  readonly method?: string;
  readonly offset?: number;
  readonly length?: number;
  readonly requestHeaders?: readonly {
    readonly name?: string;
    readonly value?: string;
  }[];
}

export interface UploadFileMetadata {
  readonly fileName: string;
  /** Byte size, the reservation's required `fileSize` attribute. */
  readonly fileSize: number;
}

export interface MediaTransferResult {
  readonly operationCount: number;
  readonly bytesTransferred: number;
}

export interface UploadFilePartsOptions {
  /** Per-part transport retry tuning; tests shrink the backoff. */
  readonly retry?: RetryOptions;
  /** Base fetch under the per-part retry; defaults to global fetch. Test seam. */
  readonly fetch?: FetchLike;
}

type RequestInitWithDuplex = RequestInit & { duplex?: "half" };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function defaultSleep(ms: number): Promise<void> {
  await delay(ms);
}

/** Origin + path, dropping the short-lived signed query (a secret). */
function sanitizeUploadUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    return "the upload URL";
  }
}

/**
 * Reads the reservation inputs from the local file. A missing or unreadable
 * file fails here as a transfer-read error, before any ASC request is made.
 */
export async function readUploadFileMetadata(
  filePath: string,
): Promise<UploadFileMetadata> {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      throw new AscFileProcessingError(
        `${filePath} is not a regular file.`,
        "transfer-read",
        { target: filePath },
      );
    }
    return { fileName: basename(filePath), fileSize: stats.size };
  } catch (error) {
    if (error instanceof AscFileProcessingError) {
      throw error;
    }
    throw new AscFileProcessingError(
      `Reading ${filePath} failed: ${messageOf(error)}`,
      "transfer-read",
      { target: filePath, cause: error },
    );
  }
}

/**
 * Hex MD5 over the whole source file in a single streaming pass — the
 * `sourceFileChecksum` the commit step sends. Computed over the raw source
 * bytes (the upload-side inverse of the report download's compressed-bytes
 * basis) and kept separate from the byte transfer so the hash never depends on
 * operation ordering.
 */
export async function computeFileMd5(filePath: string): Promise<string> {
  const hash = createHash("md5");
  try {
    for await (const chunk of createReadStream(filePath)) {
      hash.update(chunk as Uint8Array);
    }
  } catch (error) {
    throw new AscFileProcessingError(
      `Reading ${filePath} to checksum it failed: ${messageOf(error)}`,
      "transfer-read",
      { target: filePath, cause: error },
    );
  }
  return hash.digest("hex");
}

interface PartRetry {
  readonly maxAttempts: number;
  readonly backoffDelayMs: (attempt: number) => number;
  readonly sleep: (ms: number) => Promise<void>;
}

async function transferPart(
  filePath: string,
  operation: UploadPartOperation,
  fetchImpl: FetchLike,
  retry: PartRetry,
): Promise<number> {
  const { url, length, offset } = operation;
  // offset can legitimately be 0, so test for presence, not truthiness.
  if (url === undefined || length === undefined || offset === undefined) {
    throw new AscUpstreamError(
      "An upload operation is missing its url, offset, or length; Apple's reservation response is incomplete.",
    );
  }
  const method = operation.method ?? "PUT";
  const target = sanitizeUploadUrl(url);

  for (let attempt = 1; ; attempt += 1) {
    const headers = new Headers();
    for (const header of operation.requestHeaders ?? []) {
      if (header.name !== undefined && header.value !== undefined) {
        headers.set(header.name, header.value);
      }
    }
    // Storage targets reject a chunked body; a streamed PUT needs the length
    // declared explicitly.
    headers.set("content-length", String(length));
    // A fresh ranged stream every attempt: a half-consumed stream cannot be
    // replayed, which is exactly why this bypasses the transport's
    // clone-based retry.
    const body = Readable.toWeb(
      createReadStream(filePath, { start: offset, end: offset + length - 1 }),
    ) as ReadableStream<Uint8Array>;
    const init: RequestInitWithDuplex = {
      method,
      headers,
      body,
      duplex: "half",
    };

    let response: Response;
    try {
      response = await fetchImpl(new Request(url, init));
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      if (attempt < retry.maxAttempts) {
        await retry.sleep(retry.backoffDelayMs(attempt));
        continue;
      }
      throw new AscFileProcessingError(
        `Uploading to ${target} failed at the network level after ${String(attempt)} attempt(s): ${messageOf(error)}`,
        "transfer",
        { target, cause: error },
      );
    }

    if (
      (response.status === 429 || response.status >= 500) &&
      attempt < retry.maxAttempts
    ) {
      await response.body?.cancel().catch(() => undefined);
      await retry.sleep(retry.backoffDelayMs(attempt));
      continue;
    }
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) {
      throw new AscFileProcessingError(
        `Uploading to ${target} failed with HTTP ${String(response.status)}`,
        "transfer",
        { target, request: { method, url: target, status: response.status } },
      );
    }
    return length;
  }
}

/**
 * PUTs each upload operation's byte range to its pre-signed URL. Deliberately
 * a bare fetch, never the authenticated ASC client: the upload URLs belong to
 * a third-party storage host and the Bearer token must not leak to them (the
 * inverse of the analytics segment download guarantee). Parts transfer
 * sequentially — the common reservation is a single operation, op counts are
 * tiny, ordering keeps the run auditable, and the storage host gains nothing
 * from parallelism (the same stance as analytics segments).
 */
export async function uploadFileParts(
  filePath: string,
  operations: readonly UploadPartOperation[],
  options: UploadFilePartsOptions = {},
): Promise<MediaTransferResult> {
  if (operations.length === 0) {
    throw new AscUpstreamError(
      "Apple's reservation returned no upload operations; there is nothing to upload.",
    );
  }
  const fetchImpl =
    options.fetch ?? ((request: Request) => globalThis.fetch(request));
  const maxAttempts = options.retry?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.retry?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.retry?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const sleep = options.retry?.sleep ?? defaultSleep;
  const random = options.retry?.random ?? Math.random;
  const retry: PartRetry = {
    maxAttempts,
    // AWS-style full jitter, identical to the transport layer's policy.
    backoffDelayMs: (attempt) =>
      random() * Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)),
    sleep,
  };

  let bytesTransferred = 0;
  for (const operation of operations) {
    bytesTransferred += await transferPart(
      filePath,
      operation,
      fetchImpl,
      retry,
    );
  }
  return { operationCount: operations.length, bytesTransferred };
}
