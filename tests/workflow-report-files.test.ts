import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AscFileProcessingError } from "../src/errors.js";
import { downloadExternalFile } from "../src/workflows/report-files.js";
import { headerValue, useMockAgent } from "./helpers/mock-agent.js";

const SEGMENT_ORIGIN = "https://segments.example.test";
const SEGMENT_CSV = "Date,App Name,Downloads\n2026-06-10,Sonara,4\n";

const getAgent = useMockAgent();

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "asc-segment-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("downloadExternalFile", () => {
  it("downloads without auth headers, verifies the checksum, and lands the file", async () => {
    const gz = gzipSync(SEGMENT_CSV);
    let authHeader: string | undefined = "unset";
    getAgent()
      .get(SEGMENT_ORIGIN)
      .intercept({
        path: (path) => path.startsWith("/reports/seg-0"),
        method: "GET",
      })
      .reply((request) => {
        authHeader = headerValue(request.headers, "authorization");
        return { statusCode: 200, data: gz };
      });
    const filePath = join(dir, "segment-000.csv");

    const saved = await downloadExternalFile(
      `${SEGMENT_ORIGIN}/reports/seg-0?signature=short-lived-secret`,
      filePath,
      { expectedMd5: createHash("md5").update(gz).digest("hex") },
    );

    expect(authHeader).toBeUndefined();
    expect(await readFile(filePath, "utf8")).toBe(SEGMENT_CSV);
    expect(saved).toMatchObject({
      wasGzipped: true,
      rows: 1,
      delimiter: "comma",
    });
  });

  it("maps a non-OK response to a download-stage error with the query stripped", async () => {
    getAgent()
      .get(SEGMENT_ORIGIN)
      .intercept({
        path: (path) => path.startsWith("/reports/seg-1"),
        method: "GET",
      })
      .reply(403, "expired");

    const error = await downloadExternalFile(
      `${SEGMENT_ORIGIN}/reports/seg-1?signature=short-lived-secret`,
      join(dir, "segment-001.csv"),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AscFileProcessingError);
    expect(error).toMatchObject({
      stage: "download",
      target: `${SEGMENT_ORIGIN}/reports/seg-1`,
      request: {
        method: "GET",
        url: `${SEGMENT_ORIGIN}/reports/seg-1`,
        status: 403,
      },
    });
    expect((error as Error).message).not.toContain("signature");
  });

  it("treats a checksum mismatch as corrupt evidence, not a saved file", async () => {
    const gz = gzipSync(SEGMENT_CSV);
    getAgent()
      .get(SEGMENT_ORIGIN)
      .intercept({
        path: (path) => path.startsWith("/reports/seg-2"),
        method: "GET",
      })
      .reply(200, gz);
    const filePath = join(dir, "segment-002.csv");

    const error = await downloadExternalFile(
      `${SEGMENT_ORIGIN}/reports/seg-2?signature=s`,
      filePath,
      { expectedMd5: "0".repeat(32) },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AscFileProcessingError);
    expect(error).toMatchObject({
      stage: "checksum",
      target: `${filePath}.corrupt`,
    });
  });

  it("rejects an unparseable URL before touching the network", async () => {
    const error = await downloadExternalFile(
      "not a url",
      join(dir, "segment-003.csv"),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AscFileProcessingError);
    expect(error).toMatchObject({ stage: "download" });
  });
});
