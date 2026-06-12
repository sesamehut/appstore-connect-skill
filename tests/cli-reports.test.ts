import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/cli/main.js";
import { ASC_API_BASE_URL } from "../src/http/client.js";
import { ascItem, JSON_HEADERS } from "./helpers/asc-fixtures.js";
import { useMockAgent } from "./helpers/mock-agent.js";
import {
  FINANCE_REPORT_TSV,
  SALES_SUMMARY_TSV,
} from "./helpers/report-fixtures.js";
import { makeTestKey } from "./helpers/test-credentials.js";

const getAgent = useMockAgent();

let env: Record<string, string>;

beforeAll(async () => {
  env = (await makeTestKey()).envTeam;
});

function makeIo() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      out: (text: string) => out.push(text),
      err: (text: string) => err.push(text),
    },
    out,
    err,
  };
}

describe("reports analytics ensure-request", () => {
  it("emits the request document with the resolved.created marker", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) =>
          path.startsWith("/v1/apps/app-1/analyticsReportRequests"),
        method: "GET",
      })
      .reply(
        200,
        {
          data: [],
          links: {
            self: `${ASC_API_BASE_URL}/v1/apps/app-1/analyticsReportRequests`,
          },
        },
        { headers: JSON_HEADERS },
      );
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/analyticsReportRequests", method: "POST" })
      .reply(
        201,
        {
          data: {
            type: "analyticsReportRequests",
            id: "req-new",
            attributes: {
              accessType: "ONGOING",
              stoppedDueToInactivity: false,
            },
          },
          links: {
            self: `${ASC_API_BASE_URL}/v1/analyticsReportRequests/req-new`,
          },
        },
        { headers: JSON_HEADERS },
      );

    const captured = makeIo();
    const exit = await runCli(
      ["reports", "analytics", "ensure-request", "--app", "app-1"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      command: string;
      data: { id: string };
      resolved: { created: boolean };
    };
    expect(envelope.command).toBe("reports analytics ensure-request");
    expect(envelope.data.id).toBe("req-new");
    expect(envelope.resolved.created).toBe(true);
  });

  it("rejects an unknown access type as a usage error", async () => {
    const captured = makeIo();
    const exit = await runCli(
      [
        "reports",
        "analytics",
        "ensure-request",
        "--app",
        "app-1",
        "--access-type",
        "SOMETIMES",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.out).toEqual([]);
    expect(captured.err[0]).toContain("ONE_TIME_SNAPSHOT");
  });
});

describe("reports analytics delete-request", () => {
  it("deletes by id and reports the deletion", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: "/v1/analyticsReportRequests/req-old",
        method: "DELETE",
      })
      .reply(204);

    const captured = makeIo();
    const exit = await runCli(
      ["reports", "analytics", "delete-request", "req-old"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      data: { id: string; deleted: boolean };
    };
    expect(envelope.data).toEqual({ id: "req-old", deleted: true });
  });
});

describe("reports sales download", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "asc-cli-sales-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const salesEnv = () => ({ ...env, ASC_VENDOR_NUMBER: "12345678" });

  function mockSalesReports(body: Buffer | string): () => string {
    let capturedPath = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) => {
          if (!path.startsWith("/v1/salesReports")) {
            return false;
          }
          capturedPath = path;
          return true;
        },
        method: "GET",
      })
      .reply(200, body, {
        headers: { "content-type": "application/a-gzip" },
      });
    return () => decodeURIComponent(capturedPath);
  }

  it("lands the file and emits the summary with a masked vendor echo", async () => {
    mockSalesReports(gzipSync(SALES_SUMMARY_TSV));
    const output = join(dir, "sales.tsv");

    const captured = makeIo();
    const exit = await runCli(
      [
        "reports",
        "sales",
        "download",
        "--date",
        "2026-06-10",
        "--output",
        output,
      ],
      captured.io,
      salesEnv(),
    );

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      command: string;
      data: {
        file: { path: string; rows: number; wasGzipped: boolean };
        report: { vendorNumber: string; reportDate: string };
      };
    };
    expect(envelope.command).toBe("reports sales download");
    expect(envelope.data.file).toMatchObject({
      path: output,
      rows: 2,
      wasGzipped: true,
    });
    expect(envelope.data.report).toMatchObject({
      vendorNumber: "...5678",
      reportDate: "2026-06-10",
    });
    expect(JSON.stringify(envelope)).not.toContain("12345678");
    expect(await readFile(output, "utf8")).toBe(SALES_SUMMARY_TSV);
  });

  it("converts to JSON on --format json and reports the sibling path", async () => {
    mockSalesReports(gzipSync(SALES_SUMMARY_TSV));
    const output = join(dir, "sales.tsv");

    const captured = makeIo();
    const exit = await runCli(
      ["reports", "sales", "download", "--output", output, "--format", "json"],
      captured.io,
      salesEnv(),
    );

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      data: { file: { convertedJsonPath: string } };
    };
    expect(envelope.data.file.convertedJsonPath).toBe(join(dir, "sales.json"));
    const records = JSON.parse(
      await readFile(envelope.data.file.convertedJsonPath, "utf8"),
    ) as Record<string, string>[];
    expect(records).toHaveLength(2);
    expect(records[0]?.Units).toBe("3");
  });

  it("lets --vendor override the environment variable", async () => {
    const pathOf = mockSalesReports(gzipSync(SALES_SUMMARY_TSV));

    const exit = await runCli(
      [
        "reports",
        "sales",
        "download",
        "--vendor",
        "87654321",
        "--output",
        join(dir, "sales.tsv"),
      ],
      makeIo().io,
      salesEnv(),
    );

    expect(exit).toBe(0);
    expect(pathOf()).toContain("filter[vendorNumber]=87654321");
  });

  it("fails as usage when no vendor number is configured, before any request", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["reports", "sales", "download"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.out).toEqual([]);
    expect(captured.err[0]).toContain("ASC_VENDOR_NUMBER");
  });

  it("rejects a date that does not match the frequency's format", async () => {
    const captured = makeIo();
    const exit = await runCli(
      [
        "reports",
        "sales",
        "download",
        "--frequency",
        "MONTHLY",
        "--date",
        "2026-06-10",
      ],
      captured.io,
      salesEnv(),
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("YYYY-MM");
  });

  it("surfaces a corrupted payload as error[file-processing] with the stage", async () => {
    const gz = gzipSync(SALES_SUMMARY_TSV);
    mockSalesReports(gz.subarray(0, gz.length - 8));

    const captured = makeIo();
    const exit = await runCli(
      ["reports", "sales", "download", "--output", join(dir, "sales.tsv")],
      captured.io,
      salesEnv(),
    );

    expect(exit).toBe(3);
    expect(captured.err[0]).toContain("error[file-processing]:");
    expect(
      captured.err.some((line) => line.startsWith("stage: decompress")),
    ).toBe(true);
  });

  it("answers a 404 with the enriched availability guidance", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) => path.startsWith("/v1/salesReports"),
        method: "GET",
      })
      .reply(
        404,
        { errors: [ascItem({ code: "NOT_FOUND", status: "404" })] },
        { headers: JSON_HEADERS },
      );

    const captured = makeIo();
    const exit = await runCli(
      ["reports", "sales", "download", "--date", "2026-06-10"],
      captured.io,
      salesEnv(),
    );

    expect(exit).toBe(3);
    expect(captured.err[0]).toContain("error[not-found]:");
    expect(captured.err[0]).toContain("2026-06-10");
  });
});

describe("reports finance download", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "asc-cli-finance-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("lands the file and echoes the fiscal-month parameters", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) => path.startsWith("/v1/financeReports"),
        method: "GET",
      })
      .reply(200, gzipSync(FINANCE_REPORT_TSV), {
        headers: { "content-type": "application/a-gzip" },
      });
    const output = join(dir, "finance.tsv");

    const captured = makeIo();
    const exit = await runCli(
      [
        "reports",
        "finance",
        "download",
        "--region",
        "ZZ",
        "--date",
        "2026-05",
        "--output",
        output,
      ],
      captured.io,
      { ...env, ASC_VENDOR_NUMBER: "12345678" },
    );

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      command: string;
      data: {
        file: { path: string; rows: number };
        report: { vendorNumber: string; regionCode: string };
      };
    };
    expect(envelope.command).toBe("reports finance download");
    expect(envelope.data.file).toMatchObject({ path: output, rows: 1 });
    expect(envelope.data.report).toMatchObject({
      vendorNumber: "...5678",
      regionCode: "ZZ",
    });
    expect(await readFile(output, "utf8")).toBe(FINANCE_REPORT_TSV);
  });

  it("requires --region and --date via citty's validation", async () => {
    const captured = makeIo();
    const exit = await runCli(["reports", "finance", "download"], captured.io, {
      ...env,
      ASC_VENDOR_NUMBER: "12345678",
    });

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("error[usage]:");
  });

  it("rejects a non-fiscal-month date as usage", async () => {
    const captured = makeIo();
    const exit = await runCli(
      [
        "reports",
        "finance",
        "download",
        "--region",
        "ZZ",
        "--date",
        "2026-05-01",
      ],
      captured.io,
      { ...env, ASC_VENDOR_NUMBER: "12345678" },
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("YYYY-MM");
  });
});

describe("reports analytics list-reports", () => {
  it("lists with the standard list envelope", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) =>
          path.startsWith("/v1/analyticsReportRequests/req-1/reports"),
        method: "GET",
      })
      .reply(
        200,
        {
          data: [
            {
              type: "analyticsReports",
              id: "rep-1",
              attributes: {
                name: "App Downloads Standard",
                category: "APP_USAGE",
              },
            },
          ],
          links: { self: `${ASC_API_BASE_URL}/v1/list` },
        },
        { headers: JSON_HEADERS },
      );

    const captured = makeIo();
    const exit = await runCli(
      ["reports", "analytics", "list-reports", "--request", "req-1"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      command: string;
      data: { id: string }[];
      pagination: { scope: string };
    };
    expect(envelope.command).toBe("reports analytics list-reports");
    expect(envelope.data[0]?.id).toBe("rep-1");
    expect(envelope.pagination.scope).toBe("single-page");
  });
});

describe("reports analytics download", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "asc-cli-analytics-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("walks the chain, reports the resolved intermediates, and hides segment URLs", async () => {
    const segmentCsv = "Date,Counts\n2026-06-11,7\n";
    const listReply = (resources: unknown[]) =>
      [
        200,
        { data: resources, links: { self: `${ASC_API_BASE_URL}/v1/list` } },
        { headers: JSON_HEADERS },
      ] as const;
    const agent = () => getAgent().get(ASC_API_BASE_URL);
    agent()
      .intercept({
        path: (path) =>
          path.startsWith("/v1/apps/app-1/analyticsReportRequests"),
        method: "GET",
      })
      .reply(
        ...listReply([
          {
            type: "analyticsReportRequests",
            id: "req-1",
            attributes: {
              accessType: "ONGOING",
              stoppedDueToInactivity: false,
            },
          },
        ]),
      );
    agent()
      .intercept({
        path: (path) =>
          path.startsWith("/v1/analyticsReportRequests/req-1/reports"),
        method: "GET",
      })
      .reply(
        ...listReply([
          {
            type: "analyticsReports",
            id: "rep-1",
            attributes: {
              name: "App Downloads Standard",
              category: "APP_USAGE",
            },
          },
        ]),
      );
    agent()
      .intercept({
        path: (path) => path.startsWith("/v1/analyticsReports/rep-1/instances"),
        method: "GET",
      })
      .reply(
        ...listReply([
          {
            type: "analyticsReportInstances",
            id: "inst-1",
            attributes: { granularity: "DAILY", processingDate: "2026-06-11" },
          },
        ]),
      );
    agent()
      .intercept({
        path: (path) =>
          path.startsWith("/v1/analyticsReportInstances/inst-1/segments"),
        method: "GET",
      })
      .reply(
        ...listReply([
          {
            type: "analyticsReportSegments",
            id: "seg-0",
            attributes: {
              url: "https://segments.example.test/seg/0?sig=do-not-echo",
              checksum: "unrecognized",
              sizeInBytes: segmentCsv.length,
            },
          },
        ]),
      );
    getAgent()
      .get("https://segments.example.test")
      .intercept({ path: (path) => path.startsWith("/seg/0"), method: "GET" })
      .reply(200, segmentCsv);
    const outputDir = join(dir, "report");

    const captured = makeIo();
    const exit = await runCli(
      [
        "reports",
        "analytics",
        "download",
        "--app",
        "app-1",
        "--name",
        "App Downloads Standard",
        "--output-dir",
        outputDir,
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const raw = captured.out[0] ?? "";
    const envelope = JSON.parse(raw) as {
      command: string;
      data: { directory: string; segments: { path: string; rows: number }[] };
      resolved: Record<string, unknown>;
    };
    expect(envelope.command).toBe("reports analytics download");
    expect(envelope.data.directory).toBe(outputDir);
    expect(envelope.data.segments[0]).toMatchObject({
      path: join(outputDir, "segment-000.csv"),
      rows: 1,
    });
    expect(envelope.resolved).toMatchObject({
      requestId: "req-1",
      accessType: "ONGOING",
      reportId: "rep-1",
      reportName: "App Downloads Standard",
      category: "APP_USAGE",
      instanceId: "inst-1",
      granularity: "DAILY",
      processingDate: "2026-06-11",
    });
    // Short-lived signed URLs stay out of the envelope.
    expect(raw).not.toContain("do-not-echo");
    expect(raw).not.toContain("segments.example.test");
    expect(await readFile(join(outputDir, "segment-000.csv"), "utf8")).toBe(
      segmentCsv,
    );
  });

  it("rejects mixing --instance with selector flags, before any request", async () => {
    const captured = makeIo();
    const exit = await runCli(
      [
        "reports",
        "analytics",
        "download",
        "--instance",
        "inst-1",
        "--app",
        "app-1",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("--instance");
  });

  it("requires either --instance or --app with --name", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["reports", "analytics", "download", "--app", "app-1"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("--name");
  });
});
