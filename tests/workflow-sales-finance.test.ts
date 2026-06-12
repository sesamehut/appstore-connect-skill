import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ASC_API_BASE_URL } from "../src/http/client.js";
import type { AscClient } from "../src/http/client.js";
import {
  AscFileProcessingError,
  AscNotFoundError,
  AscPermissionError,
} from "../src/errors.js";
import { downloadSalesReport } from "../src/workflows/sales-reports.js";
import type { SalesReportSpec } from "../src/workflows/sales-reports.js";
import {
  ascItem,
  JSON_HEADERS,
  makeOfflineClient,
  thrownBy,
} from "./helpers/asc-fixtures.js";
import { useMockAgent } from "./helpers/mock-agent.js";
import { SALES_SUMMARY_TSV } from "./helpers/report-fixtures.js";

const GZIP_HEADERS = { "content-type": "application/a-gzip" };

const getAgent = useMockAgent();

let client: AscClient;
let dir: string;

beforeEach(async () => {
  client = await makeOfflineClient();
  dir = await mkdtemp(join(tmpdir(), "asc-sales-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const LATEST_SPEC: SalesReportSpec = {
  vendorNumber: "12345678",
  reportType: "SALES",
  reportSubType: "SUMMARY",
  frequency: "DAILY",
};
const DAILY_SPEC: SalesReportSpec = {
  ...LATEST_SPEC,
  reportDate: "2026-06-10",
};

function mockSalesReports(
  reply:
    | { readonly status: 200; readonly body: Buffer | string }
    | { readonly status: number; readonly errorCode: string },
) {
  let capturedPath = "";
  const agent = getAgent().get(ASC_API_BASE_URL);
  const interceptor = agent.intercept({
    path: (path) => {
      if (!path.startsWith("/v1/salesReports")) {
        return false;
      }
      capturedPath = path;
      return true;
    },
    method: "GET",
  });
  if (reply.status === 200 && "body" in reply) {
    interceptor.reply(200, reply.body, { headers: GZIP_HEADERS });
  } else if ("errorCode" in reply) {
    interceptor.reply(
      reply.status,
      {
        errors: [
          ascItem({ code: reply.errorCode, status: String(reply.status) }),
        ],
      },
      { headers: JSON_HEADERS },
    );
  }
  return () => decodeURIComponent(capturedPath);
}

describe("downloadSalesReport", () => {
  it("sends the exact filters and lands the decompressed TSV", async () => {
    const gz = gzipSync(SALES_SUMMARY_TSV);
    const pathOf = mockSalesReports({ status: 200, body: gz });
    const filePath = join(dir, "sales.tsv");

    const saved = await downloadSalesReport(
      client,
      { ...DAILY_SPEC, version: "1_1" },
      filePath,
    );

    const path = pathOf();
    expect(path).toContain("filter[frequency]=DAILY");
    expect(path).toContain("filter[reportType]=SALES");
    expect(path).toContain("filter[reportSubType]=SUMMARY");
    expect(path).toContain("filter[vendorNumber]=12345678");
    expect(path).toContain("filter[reportDate]=2026-06-10");
    expect(path).toContain("filter[version]=1_1");
    expect(await readFile(filePath, "utf8")).toBe(SALES_SUMMARY_TSV);
    expect(saved).toMatchObject({
      wasGzipped: true,
      compressedBytes: gz.length,
      rows: 2,
      delimiter: "tab",
    });
    expect(saved.headers).toContain("Units");
  });

  it("omits the date filter entirely for a latest-report read", async () => {
    const pathOf = mockSalesReports({
      status: 200,
      body: gzipSync(SALES_SUMMARY_TSV),
    });
    await downloadSalesReport(client, LATEST_SPEC, join(dir, "latest.tsv"));

    expect(pathOf()).not.toContain("filter[reportDate]");
  });

  it("passes an already-decompressed body straight through", async () => {
    mockSalesReports({ status: 200, body: SALES_SUMMARY_TSV });
    const filePath = join(dir, "plain.tsv");

    const saved = await downloadSalesReport(client, DAILY_SPEC, filePath);

    expect(saved.wasGzipped).toBe(false);
    expect(await readFile(filePath, "utf8")).toBe(SALES_SUMMARY_TSV);
  });

  it("maps a truncated gzip body to a decompress-stage error", async () => {
    const gz = gzipSync(SALES_SUMMARY_TSV);
    mockSalesReports({ status: 200, body: gz.subarray(0, gz.length - 8) });

    const error = await thrownBy(
      downloadSalesReport(client, DAILY_SPEC, join(dir, "broken.tsv")),
    );

    expect(error).toBeInstanceOf(AscFileProcessingError);
    expect(error).toMatchObject({ stage: "decompress" });
  });

  it("enriches a 404 with availability guidance, masking the vendor number", async () => {
    mockSalesReports({ status: 404, errorCode: "NOT_FOUND" });

    const error = await thrownBy(
      downloadSalesReport(client, DAILY_SPEC, join(dir, "missing.tsv")),
    );

    expect(error).toBeInstanceOf(AscNotFoundError);
    expect(error.message).toContain("DAILY SALES/SUMMARY");
    expect(error.message).toContain("2026-06-10");
    expect(error.message).toContain("...5678");
    expect(error.message).not.toContain("12345678");
    expect(error.apiErrors[0]?.code).toBe("NOT_FOUND");
    expect(error.cause).toBeInstanceOf(AscNotFoundError);
  });

  it("lets a 403 permission error pass through unenriched", async () => {
    mockSalesReports({ status: 403, errorCode: "FORBIDDEN_ERROR" });

    const error = await thrownBy(
      downloadSalesReport(client, DAILY_SPEC, join(dir, "denied.tsv")),
    );

    expect(error).toBeInstanceOf(AscPermissionError);
  });
});
