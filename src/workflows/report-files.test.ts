import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AscFileProcessingError } from "../errors.js";
import {
  analyticsSegmentFileName,
  convertDelimitedReportToJson,
  defaultAnalyticsReportDirName,
  defaultFinanceReportFileName,
  defaultSalesReportFileName,
  isGzipMagic,
  saveReportStream,
} from "./report-files.js";

const SALES_HEADER = [
  "Provider",
  "Provider Country",
  "SKU",
  "Developer",
  "Title",
  "Units",
  "Country Code",
].join("\t");
const SALES_DATA_ROWS = [
  ["APPLE", "US", "sonara", "Sesame Hut", "Sonara", "3", "US"].join("\t"),
  ["APPLE", "US", "sonara", "Sesame Hut", "Sonara", "1", "CN"].join("\t"),
];
const SALES_TSV = [SALES_HEADER, ...SALES_DATA_ROWS, ""].join("\n");

function md5Of(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("hex");
}

async function* chunked(
  bytes: Uint8Array,
  sizes: readonly number[] = [],
): AsyncGenerator<Uint8Array> {
  // Forces genuinely asynchronous delivery, like a network stream.
  await Promise.resolve();
  let offset = 0;
  for (const size of sizes) {
    yield bytes.subarray(offset, offset + size);
    offset += size;
  }
  if (offset < bytes.length) {
    yield bytes.subarray(offset);
  }
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected the promise to reject");
  } catch (error) {
    return error;
  }
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "asc-report-files-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("isGzipMagic", () => {
  it("recognizes the gzip magic bytes", () => {
    expect(isGzipMagic(gzipSync("x"))).toBe(true);
  });

  it.each([
    ["plain text", Buffer.from("Provider\tSKU")],
    ["a single magic byte", Buffer.from([0x1f])],
    ["empty input", Buffer.alloc(0)],
  ])("rejects %s", (_name, bytes) => {
    expect(isGzipMagic(bytes)).toBe(false);
  });
});

describe("saveReportStream", () => {
  it("decompresses a gzipped TSV and summarizes its line structure", async () => {
    const gz = gzipSync(SALES_TSV);
    const filePath = join(dir, "sales.tsv");

    // 1-byte first chunk forces the gzip sniff across chunk boundaries.
    const saved = await saveReportStream(chunked(gz, [1, 2]), filePath);

    expect(await readFile(filePath, "utf8")).toBe(SALES_TSV);
    expect(saved).toEqual({
      path: filePath,
      bytesWritten: Buffer.byteLength(SALES_TSV),
      compressedBytes: gz.length,
      wasGzipped: true,
      md5: md5Of(gz),
      rows: 2,
      headers: SALES_HEADER.split("\t"),
      delimiter: "tab",
    });
  });

  it("passes a plain CSV through and counts an unterminated last line", async () => {
    const csv =
      "Date,App Name,Counts\n2026-06-10,Sonara,4\n2026-06-11,Sonara,7";
    const bytes = Buffer.from(csv);
    const filePath = join(dir, "analytics.csv");

    const saved = await saveReportStream(chunked(bytes, [3]), filePath);

    expect(await readFile(filePath, "utf8")).toBe(csv);
    expect(saved).toMatchObject({
      wasGzipped: false,
      md5: md5Of(bytes),
      rows: 2,
      headers: ["Date", "App Name", "Counts"],
      delimiter: "comma",
    });
  });

  it("writes an empty source as an empty file with zero rows", async () => {
    const filePath = join(dir, "empty.tsv");

    const saved = await saveReportStream(chunked(Buffer.alloc(0)), filePath);

    expect((await stat(filePath)).size).toBe(0);
    expect(saved).toEqual({
      path: filePath,
      bytesWritten: 0,
      compressedBytes: 0,
      wasGzipped: false,
      md5: md5Of(Buffer.alloc(0)),
      rows: 0,
    });
  });

  it("maps a truncated gzip stream to a decompress-stage error and leaves no file", async () => {
    const gz = gzipSync(SALES_TSV);
    const filePath = join(dir, "truncated.tsv");

    const error = await captureError(
      saveReportStream(chunked(gz.subarray(0, gz.length - 8)), filePath),
    );

    expect(error).toBeInstanceOf(AscFileProcessingError);
    expect(error).toMatchObject({ stage: "decompress", target: filePath });
    await expect(stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("renames a checksum mismatch to .corrupt and throws a checksum-stage error", async () => {
    const gz = gzipSync(SALES_TSV);
    const filePath = join(dir, "mismatch.tsv");

    const error = await captureError(
      saveReportStream(chunked(gz), filePath, {
        expectedMd5: "0".repeat(32),
      }),
    );

    expect(error).toBeInstanceOf(AscFileProcessingError);
    expect(error).toMatchObject({
      stage: "checksum",
      target: `${filePath}.corrupt`,
    });
    await expect(stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(`${filePath}.corrupt`, "utf8")).toBe(SALES_TSV);
  });

  it("accepts a matching checksum case-insensitively", async () => {
    const gz = gzipSync(SALES_TSV);
    const filePath = join(dir, "match.tsv");

    const saved = await saveReportStream(chunked(gz), filePath, {
      expectedMd5: md5Of(gz).toUpperCase(),
    });

    expect(saved.md5).toBe(md5Of(gz));
  });

  it("maps a failing source to a download-stage error naming the source", async () => {
    const filePath = join(dir, "failed.tsv");
    async function* failingSource(): AsyncGenerator<Uint8Array> {
      yield Buffer.from("Provider\tSKU\n");
      await Promise.resolve();
      throw new Error("connection reset");
    }

    const error = await captureError(
      saveReportStream(failingSource(), filePath, {
        sourceTarget: "https://segments.example.test/seg/0",
      }),
    );

    expect(error).toBeInstanceOf(AscFileProcessingError);
    expect(error).toMatchObject({
      stage: "download",
      target: "https://segments.example.test/seg/0",
    });
    expect((error as Error).message).toContain("connection reset");
    await expect(stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("maps an unwritable destination to a write-stage error", async () => {
    const filePath = join(dir, "missing-dir", "report.tsv");

    const error = await captureError(
      saveReportStream(chunked(Buffer.from(SALES_TSV)), filePath),
    );

    expect(error).toBeInstanceOf(AscFileProcessingError);
    expect(error).toMatchObject({ stage: "write", target: filePath });
  });
});

describe("convertDelimitedReportToJson", () => {
  it("converts a TSV to a JSON array of header-keyed string records", async () => {
    const sourcePath = join(dir, "sales.tsv");
    const jsonPath = join(dir, "sales.json");
    await writeFile(sourcePath, SALES_TSV);

    const converted = await convertDelimitedReportToJson(sourcePath, jsonPath);

    expect(converted).toEqual({ path: jsonPath, rows: 2 });
    expect(JSON.parse(await readFile(jsonPath, "utf8"))).toEqual([
      {
        Provider: "APPLE",
        "Provider Country": "US",
        SKU: "sonara",
        Developer: "Sesame Hut",
        Title: "Sonara",
        Units: "3",
        "Country Code": "US",
      },
      {
        Provider: "APPLE",
        "Provider Country": "US",
        SKU: "sonara",
        Developer: "Sesame Hut",
        Title: "Sonara",
        Units: "1",
        "Country Code": "CN",
      },
    ]);
  });

  it("handles CRLF line endings and pads short rows with empty strings", async () => {
    const sourcePath = join(dir, "report.csv");
    const jsonPath = join(dir, "report.json");
    await writeFile(sourcePath, "Date,Counts\r\n2026-06-10\r\n");

    const converted = await convertDelimitedReportToJson(sourcePath, jsonPath);

    expect(converted.rows).toBe(1);
    expect(JSON.parse(await readFile(jsonPath, "utf8"))).toEqual([
      { Date: "2026-06-10", Counts: "" },
    ]);
  });

  it("maps a missing source to a parse-stage error and removes the partial JSON", async () => {
    const sourcePath = join(dir, "missing.tsv");
    const jsonPath = join(dir, "missing.json");

    const error = await captureError(
      convertDelimitedReportToJson(sourcePath, jsonPath),
    );

    expect(error).toBeInstanceOf(AscFileProcessingError);
    expect(error).toMatchObject({ stage: "parse", target: sourcePath });
    await expect(stat(jsonPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("default report file names", () => {
  it("names sales reports from the resolved spec, defaulting the date to latest", () => {
    expect(
      defaultSalesReportFileName({
        reportType: "SALES",
        reportSubType: "SUMMARY",
        frequency: "DAILY",
        reportDate: "2026-06-10",
      }),
    ).toBe("sales-SALES-SUMMARY-DAILY-2026-06-10.tsv");
    expect(
      defaultSalesReportFileName({
        reportType: "SALES",
        reportSubType: "SUMMARY",
        frequency: "DAILY",
      }),
    ).toBe("sales-SALES-SUMMARY-DAILY-latest.tsv");
  });

  it("names finance reports by type, region, and fiscal month", () => {
    expect(
      defaultFinanceReportFileName({
        reportType: "FINANCIAL",
        regionCode: "ZZ",
        reportDate: "2026-05",
      }),
    ).toBe("finance-FINANCIAL-ZZ-2026-05.tsv");
  });

  it("slugs analytics report names and lowercases the granularity", () => {
    expect(
      defaultAnalyticsReportDirName(
        "App Downloads Standard",
        "DAILY",
        "2026-06-10",
      ),
    ).toBe("analytics-app-downloads-standard-daily-2026-06-10");
    // A name with no ASCII alphanumerics must still produce a usable slug.
    expect(
      defaultAnalyticsReportDirName("应用下载", "WEEKLY", "2026-06-07"),
    ).toBe("analytics-report-weekly-2026-06-07");
  });

  it("zero-pads segment indexes so listings sort in download order", () => {
    expect(analyticsSegmentFileName(0, "csv")).toBe("segment-000.csv");
    expect(analyticsSegmentFileName(42, "tsv")).toBe("segment-042.tsv");
  });
});
