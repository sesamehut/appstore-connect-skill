import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rename, unlink } from "node:fs/promises";
import { Transform } from "node:stream";
import { finished, pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

import { AscFileProcessingError } from "../errors.js";
import { createRetryingFetch } from "../http/transport.js";
import type { RetryOptions } from "../http/transport.js";

export type ReportDelimiter = "tab" | "comma";

/** What landed on disk after a report download, for the result envelope. */
export interface SavedReportFile {
  readonly path: string;
  /** Decompressed bytes on disk. */
  readonly bytesWritten: number;
  /** Bytes as transferred, before any decompression. */
  readonly compressedBytes: number;
  readonly wasGzipped: boolean;
  /** Hex MD5 over the transferred (pre-decompression) bytes. */
  readonly md5: string;
  /** Data rows below the header line. */
  readonly rows: number;
  /** Column names from the header line, absent when none was readable. */
  readonly headers?: readonly string[];
  readonly delimiter?: ReportDelimiter;
}

export interface SaveReportStreamOptions {
  /**
   * Hex MD5 the transferred bytes must match. On mismatch the file is
   * renamed to `<path>.corrupt` as evidence and a checksum-stage error is
   * thrown. The compressed-bytes basis matches Apple's analytics segment
   * checksum as far as it can be told without documentation (M5 核实项 2);
   * if live verification disagrees, hash after the gunzip step instead.
   */
  readonly expectedMd5?: string;
  /** Names the source in download-stage errors (e.g. a sanitized URL). */
  readonly sourceTarget?: string;
}

/**
 * Gzip payload sniffing. Required because Apple ships report bodies as
 * gzip *content* (`Content-Type: application/a-gzip`), which fetch only
 * auto-decompresses when a `Content-Encoding: gzip` header happens to be
 * present — behavior that differs between Apple, CDNs, and test mocks.
 */
export function isGzipMagic(bytes: Uint8Array): boolean {
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function downloadFailure(
  cause: unknown,
  target: string | undefined,
): AscFileProcessingError {
  if (cause instanceof AscFileProcessingError) {
    return cause;
  }
  return new AscFileProcessingError(
    `Reading the report stream failed: ${messageOf(cause)}`,
    "download",
    { cause, ...(target !== undefined && { target }) },
  );
}

function sniffDelimiter(line: string): ReportDelimiter | undefined {
  if (line.includes("\t")) {
    return "tab";
  }
  if (line.includes(",")) {
    return "comma";
  }
  return undefined;
}

/**
 * Naive split: Apple report exports are plain delimiter-separated text
 * without field quoting as far as observed; revisit if live verification
 * (M5 核实项 3) surfaces quoted fields.
 */
function splitReportLine(
  line: string,
  delimiter: ReportDelimiter | undefined,
): string[] {
  if (delimiter === undefined) {
    return [line];
  }
  return line.split(delimiter === "tab" ? "\t" : ",");
}

const NEWLINE = 0x0a;

/**
 * Caps header capture so a non-report payload (an HTML error page, binary
 * garbage) cannot buffer unbounded memory hunting for its first newline.
 */
const HEADER_CAPTURE_CAP_BYTES = 256 * 1024;

interface LineSummary {
  readonly bytesWritten: number;
  readonly rows: number;
  readonly headers?: readonly string[];
  readonly delimiter?: ReportDelimiter;
}

function createLineObserver(): { stream: Transform; summarize(): LineSummary } {
  let bytesWritten = 0;
  let newlines = 0;
  let lastByte: number | undefined;
  let headerParts: Uint8Array[] = [];
  let headerBytes = 0;
  let headerSettled = false;
  let headerOverflow = false;

  const stream = new Transform({
    transform(chunk: Uint8Array, _encoding, callback) {
      bytesWritten += chunk.length;
      if (chunk.length > 0) {
        lastByte = chunk[chunk.length - 1];
      }
      for (
        let at = chunk.indexOf(NEWLINE);
        at !== -1;
        at = chunk.indexOf(NEWLINE, at + 1)
      ) {
        newlines += 1;
      }
      if (!headerSettled) {
        const newlineAt = chunk.indexOf(NEWLINE);
        const slice = newlineAt === -1 ? chunk : chunk.subarray(0, newlineAt);
        if (headerBytes + slice.length > HEADER_CAPTURE_CAP_BYTES) {
          headerOverflow = true;
          headerSettled = true;
          headerParts = [];
        } else {
          headerParts.push(slice);
          headerBytes += slice.length;
          if (newlineAt !== -1) {
            headerSettled = true;
          }
        }
      }
      callback(null, chunk);
    },
  });

  return {
    stream,
    summarize(): LineSummary {
      const endsWithNewline = lastByte === NEWLINE;
      const totalLines =
        bytesWritten === 0 ? 0 : newlines + (endsWithNewline ? 0 : 1);
      const rows = Math.max(0, totalLines - 1);
      if (bytesWritten === 0 || headerOverflow) {
        return { bytesWritten, rows };
      }
      const headerLine = Buffer.concat(headerParts)
        .toString("utf8")
        .replace(/\r$/, "");
      const delimiter = sniffDelimiter(headerLine);
      return {
        bytesWritten,
        rows,
        headers: splitReportLine(headerLine, delimiter),
        ...(delimiter !== undefined && { delimiter }),
      };
    },
  };
}

/**
 * Lands a report stream on disk through a single streaming pipeline — sniff
 * gzip from the leading bytes, hash the transferred bytes, conditionally
 * gunzip, observe lines for the summary, write — never buffering the body
 * (DETAILED sales reports and analytics segments reach hundreds of MB).
 *
 * Failures carry the stage they died in; nothing half-written stays at
 * `filePath` (a checksum mismatch renames to `.corrupt` instead, keeping the
 * evidence).
 */
export async function saveReportStream(
  source: AsyncIterable<Uint8Array>,
  filePath: string,
  options: SaveReportStreamOptions = {},
): Promise<SavedReportFile> {
  const iterator = source[Symbol.asyncIterator]();

  // Peek just enough leading bytes to sniff gzip before shaping the pipeline.
  const peeked: Uint8Array[] = [];
  let peekedBytes = 0;
  try {
    while (peekedBytes < 2) {
      const next = await iterator.next();
      if (next.done === true) {
        break;
      }
      peeked.push(next.value);
      peekedBytes += next.value.length;
    }
  } catch (error) {
    throw downloadFailure(error, options.sourceTarget);
  }
  const wasGzipped = isGzipMagic(
    Buffer.concat(peeked, Math.min(peekedBytes, 2)),
  );

  const hash = createHash("md5");
  let compressedBytes = 0;
  async function* transferred(): AsyncGenerator<Uint8Array> {
    try {
      for (const chunk of peeked) {
        hash.update(chunk);
        compressedBytes += chunk.length;
        yield chunk;
      }
      for (;;) {
        const next = await iterator.next();
        if (next.done === true) {
          return;
        }
        hash.update(next.value);
        compressedBytes += next.value.length;
        yield next.value;
      }
    } catch (error) {
      throw downloadFailure(error, options.sourceTarget);
    } finally {
      // A downstream failure abandons this generator early; release the
      // source so its connection does not linger.
      try {
        await iterator.return?.();
      } catch {
        // The source already failed; there is nothing left to release.
      }
    }
  }

  const gunzip = wasGzipped ? createGunzip() : undefined;
  const observer = createLineObserver();
  const writeStream = createWriteStream(filePath);
  // A failing pipeline re-emits the originating error object on the streams
  // it destroys, so error identity cannot attribute a stage. The origin
  // stream emits synchronously while destroy() re-emits a tick later — the
  // first emitter wins.
  let failedStage: "decompress" | "write" | undefined;
  gunzip?.on("error", () => {
    failedStage ??= "decompress";
  });
  writeStream.on("error", () => {
    failedStage ??= "write";
  });

  try {
    if (gunzip === undefined) {
      await pipeline(transferred(), observer.stream, writeStream);
    } else {
      await pipeline(transferred(), gunzip, observer.stream, writeStream);
    }
  } catch (error) {
    // A partial file is indistinguishable from a complete report, so a
    // failed pipeline leaves nothing behind. Wait for the descriptor to
    // close first: unlinking an open file fails on Windows.
    await finished(writeStream).catch(() => undefined);
    await unlink(filePath).catch(() => undefined);
    if (error instanceof AscFileProcessingError) {
      throw error;
    }
    if (failedStage === "decompress") {
      throw new AscFileProcessingError(
        `Decompressing the report payload failed: ${messageOf(error)}`,
        "decompress",
        { target: filePath, cause: error },
      );
    }
    if (failedStage === "write") {
      throw new AscFileProcessingError(
        `Writing the report file failed: ${messageOf(error)}`,
        "write",
        { target: filePath, cause: error },
      );
    }
    throw downloadFailure(error, options.sourceTarget);
  }

  const md5 = hash.digest("hex");
  const expectedMd5 = options.expectedMd5?.toLowerCase();
  if (expectedMd5 !== undefined && expectedMd5 !== md5) {
    let evidencePath = `${filePath}.corrupt`;
    try {
      await rename(filePath, evidencePath);
    } catch {
      // Renaming is evidence preservation, not the failure itself; if it
      // cannot happen the original path serves.
      evidencePath = filePath;
    }
    throw new AscFileProcessingError(
      `Report checksum mismatch: expected MD5 ${expectedMd5}, computed ${md5}; the transferred bytes are kept at ${evidencePath}`,
      "checksum",
      { target: evidencePath },
    );
  }

  const summary = observer.summarize();
  return {
    path: filePath,
    bytesWritten: summary.bytesWritten,
    compressedBytes,
    wasGzipped,
    md5,
    rows: summary.rows,
    ...(summary.headers !== undefined && { headers: summary.headers }),
    ...(summary.delimiter !== undefined && { delimiter: summary.delimiter }),
  };
}

export interface ConvertedJsonReport {
  readonly path: string;
  /** Data records written (the header line becomes the keys, not a record). */
  readonly rows: number;
}

/**
 * Second pass over an already-landed report file: the original TSV/CSV stays
 * the source of truth on disk, so a conversion failure costs nothing but
 * this call. Header fields become object keys verbatim — Apple's field
 * naming and string values pass through without business mapping.
 */
export async function convertDelimitedReportToJson(
  sourcePath: string,
  jsonPath: string,
): Promise<ConvertedJsonReport> {
  const input = createReadStream(sourcePath, { encoding: "utf8" });
  const output = createWriteStream(jsonPath);
  // Same attribution caveat as in saveReportStream: a failing pipeline
  // re-emits the originating error object on the streams it destroys, so
  // read-side failures are tagged inside records() and only an output that
  // emitted first counts as a write failure.
  let failedStage: "write" | undefined;
  output.on("error", () => {
    failedStage ??= "write";
  });

  let rows = 0;
  async function* records(): AsyncGenerator<string> {
    try {
      yield "[";
      let headers: readonly string[] | undefined;
      let delimiter: ReportDelimiter | undefined;
      let first = true;

      const convertLine = (rawLine: string): string | undefined => {
        const line = rawLine.replace(/\r$/, "");
        if (line === "") {
          return undefined;
        }
        if (headers === undefined) {
          delimiter = sniffDelimiter(line);
          headers = splitReportLine(line, delimiter);
          return undefined;
        }
        const fields = splitReportLine(line, delimiter);
        const record: Record<string, string> = {};
        headers.forEach((name, index) => {
          record[name] = fields[index] ?? "";
        });
        rows += 1;
        const prefix = first ? "\n" : ",\n";
        first = false;
        return prefix + JSON.stringify(record);
      };

      let remainder = "";
      // The encoding option makes the stream yield strings (decoded safely
      // across chunk boundaries); the Readable iterator types erase that.
      for await (const chunk of input as AsyncIterable<string>) {
        const lines = (remainder + chunk).split("\n");
        remainder = lines.pop() ?? "";
        for (const line of lines) {
          const record = convertLine(line);
          if (record !== undefined) {
            yield record;
          }
        }
      }
      const lastRecord = convertLine(remainder);
      if (lastRecord !== undefined) {
        yield lastRecord;
      }
      yield "\n]\n";
    } catch (error) {
      throw new AscFileProcessingError(
        `Converting the report to JSON failed: ${messageOf(error)}; the original report file is untouched at ${sourcePath}`,
        "parse",
        { target: sourcePath, cause: error },
      );
    }
  }

  try {
    await pipeline(records(), output);
  } catch (error) {
    await finished(output).catch(() => undefined);
    await unlink(jsonPath).catch(() => undefined);
    if (error instanceof AscFileProcessingError) {
      throw error;
    }
    if (failedStage === "write") {
      throw new AscFileProcessingError(
        `Writing the JSON report failed: ${messageOf(error)}`,
        "write",
        { target: jsonPath, cause: error },
      );
    }
    throw new AscFileProcessingError(
      `Converting the report to JSON failed: ${messageOf(error)}; the original report file is untouched at ${sourcePath}`,
      "parse",
      { target: sourcePath, cause: error },
    );
  }
  return { path: jsonPath, rows };
}

export interface DownloadExternalFileOptions {
  readonly expectedMd5?: string;
  /** Transport retry tuning; tests shrink the backoff. */
  readonly retry?: RetryOptions;
}

/**
 * Fetches a report artifact from a non-ASC origin (analytics segment CDN
 * URLs). Deliberately a bare retrying fetch, never the authenticated client:
 * the Bearer token must not leak to external hosts. The URL's short-lived
 * signature lives in its query string, which is also why errors and results
 * only ever carry the URL stripped of its query.
 */
export async function downloadExternalFile(
  url: string,
  filePath: string,
  options: DownloadExternalFileOptions = {},
): Promise<SavedReportFile> {
  let target: string;
  try {
    const parsed = new URL(url);
    target = parsed.origin + parsed.pathname;
  } catch (error) {
    throw new AscFileProcessingError(
      "Segment download failed: the segment URL is not a valid URL",
      "download",
      { cause: error },
    );
  }

  const transport = createRetryingFetch(
    options.retry === undefined ? {} : { retry: options.retry },
  );
  let response: Response;
  try {
    response = await transport(new Request(url));
  } catch (error) {
    throw new AscFileProcessingError(
      `Downloading ${target} failed: ${messageOf(error)}`,
      "download",
      { target, cause: error },
    );
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new AscFileProcessingError(
      `Downloading ${target} failed with HTTP ${String(response.status)}`,
      "download",
      {
        target,
        request: { method: "GET", url: target, status: response.status },
      },
    );
  }
  if (response.body === null) {
    throw new AscFileProcessingError(
      `Downloading ${target} returned no body`,
      "download",
      { target },
    );
  }
  return saveReportStream(response.body, filePath, {
    sourceTarget: target,
    ...(options.expectedMd5 !== undefined && {
      expectedMd5: options.expectedMd5,
    }),
  });
}

/** `sales-<TYPE>-<SUBTYPE>-<FREQ>-<date|latest>.tsv` */
export function defaultSalesReportFileName(spec: {
  readonly reportType: string;
  readonly reportSubType: string;
  readonly frequency: string;
  readonly reportDate?: string;
}): string {
  return `sales-${spec.reportType}-${spec.reportSubType}-${spec.frequency}-${spec.reportDate ?? "latest"}.tsv`;
}

/** `finance-<TYPE>-<REGION>-<YYYY-MM>.tsv` */
export function defaultFinanceReportFileName(spec: {
  readonly reportType: string;
  readonly regionCode: string;
  readonly reportDate: string;
}): string {
  return `finance-${spec.reportType}-${spec.regionCode}-${spec.reportDate}.tsv`;
}

/** `analytics-<slug(name)>-<granularity>-<processingDate>` */
export function defaultAnalyticsReportDirName(
  reportName: string,
  granularity: string,
  processingDate: string,
): string {
  return `analytics-${slugify(reportName)}-${granularity.toLowerCase()}-${processingDate}`;
}

/** `segment-000.<ext>`, zero-padded so listings sort in download order. */
export function analyticsSegmentFileName(
  index: number,
  extension: string,
): string {
  return `segment-${String(index).padStart(3, "0")}.${extension}`;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
  return slug === "" ? "report" : slug;
}
