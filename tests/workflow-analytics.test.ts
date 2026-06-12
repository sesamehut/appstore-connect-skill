import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AscFileProcessingError,
  AscInvalidParameterError,
  AscNotFoundError,
} from "../src/errors.js";
import { ASC_API_BASE_URL } from "../src/http/client.js";
import type { AscClient } from "../src/http/client.js";
import {
  downloadAnalyticsInstance,
  downloadAnalyticsReport,
  ensureAnalyticsReportRequest,
} from "../src/workflows/analytics-reports.js";
import {
  JSON_HEADERS,
  makeOfflineClient,
  thrownBy,
} from "./helpers/asc-fixtures.js";
import { headerValue, useMockAgent } from "./helpers/mock-agent.js";
import { ANALYTICS_SEGMENT_CSV } from "./helpers/report-fixtures.js";

const getAgent = useMockAgent();

let client: AscClient;

beforeEach(async () => {
  client = await makeOfflineClient();
});

interface RequestFixture {
  readonly id: string;
  readonly accessType?: "ONGOING" | "ONE_TIME_SNAPSHOT";
  readonly stopped?: boolean;
}

function requestResource(fixture: RequestFixture) {
  return {
    type: "analyticsReportRequests" as const,
    id: fixture.id,
    attributes: {
      accessType: fixture.accessType ?? ("ONGOING" as const),
      stoppedDueToInactivity: fixture.stopped ?? false,
    },
  };
}

function mockRequestList(appId: string, fixtures: readonly RequestFixture[]) {
  let capturedPath = "";
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({
      path: (path) => {
        if (!path.startsWith(`/v1/apps/${appId}/analyticsReportRequests`)) {
          return false;
        }
        capturedPath = path;
        return true;
      },
      method: "GET",
    })
    .reply(
      200,
      {
        data: fixtures.map(requestResource),
        links: {
          self: `${ASC_API_BASE_URL}/v1/apps/${appId}/analyticsReportRequests`,
        },
      },
      { headers: JSON_HEADERS },
    );
  return () => capturedPath;
}

describe("ensureAnalyticsReportRequest", () => {
  it("reuses the active request and never POSTs", async () => {
    const pathOf = mockRequestList("app-1", [{ id: "req-active" }]);

    const result = await ensureAnalyticsReportRequest(
      client,
      "app-1",
      "ONGOING",
    );

    // No POST interceptor is registered; assertNoPendingInterceptors in the
    // harness teardown doubles as the "create was never attempted" assertion.
    expect(result.created).toBe(false);
    expect(result.request.id).toBe("req-active");
    expect(result.stoppedRequestIds).toEqual([]);
    expect(decodeURIComponent(pathOf())).toContain(
      "filter[accessType]=ONGOING",
    );
  });

  it("creates a request when the app has none", async () => {
    mockRequestList("app-1", []);
    let capturedBody = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/analyticsReportRequests", method: "POST" })
      .reply((request) => {
        capturedBody = request.body as string;
        return {
          statusCode: 201,
          data: {
            data: requestResource({ id: "req-new" }),
            links: {
              self: `${ASC_API_BASE_URL}/v1/analyticsReportRequests/req-new`,
            },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const result = await ensureAnalyticsReportRequest(
      client,
      "app-1",
      "ONGOING",
    );

    expect(result.created).toBe(true);
    expect(result.request.id).toBe("req-new");
    expect(JSON.parse(capturedBody)).toEqual({
      data: {
        type: "analyticsReportRequests",
        attributes: { accessType: "ONGOING" },
        relationships: {
          app: { data: { type: "apps", id: "app-1" } },
        },
      },
    });
  });

  it("creates a replacement when only stopped requests exist, reporting them", async () => {
    mockRequestList("app-1", [
      { id: "req-stopped-1", stopped: true },
      { id: "req-stopped-2", stopped: true },
    ]);
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/analyticsReportRequests", method: "POST" })
      .reply(
        201,
        {
          data: requestResource({ id: "req-replacement" }),
          links: {
            self: `${ASC_API_BASE_URL}/v1/analyticsReportRequests/req-replacement`,
          },
        },
        { headers: JSON_HEADERS },
      );

    const result = await ensureAnalyticsReportRequest(
      client,
      "app-1",
      "ONGOING",
    );

    expect(result.created).toBe(true);
    expect(result.request.id).toBe("req-replacement");
    expect(result.stoppedRequestIds).toEqual([
      "req-stopped-1",
      "req-stopped-2",
    ]);
  });
});

const SEGMENT_ORIGIN = "https://segments.example.test";

function reportResource(id: string, name: string, category = "APP_USAGE") {
  return {
    type: "analyticsReports" as const,
    id,
    attributes: { name, category },
  };
}

function instanceResource(
  id: string,
  granularity: string,
  processingDate: string,
) {
  return {
    type: "analyticsReportInstances" as const,
    id,
    attributes: { granularity, processingDate },
  };
}

function segmentResource(id: string, url: string, checksum: string) {
  return {
    type: "analyticsReportSegments" as const,
    id,
    attributes: { url, checksum, sizeInBytes: 1 },
  };
}

function mockAscList(
  match: (decodedPath: string) => boolean,
  resources: unknown[],
) {
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({
      // The query serializer encodes spaces as "+", which decodeURIComponent
      // leaves alone; normalize so matchers can read plain text.
      path: (path) => match(decodeURIComponent(path.replaceAll("+", "%20"))),
      method: "GET",
    })
    .reply(
      200,
      { data: resources, links: { self: `${ASC_API_BASE_URL}/v1/list` } },
      { headers: JSON_HEADERS },
    );
}

function mockSegmentBody(
  segmentPath: string,
  body: Buffer | string,
): () => string | undefined {
  let authHeader: string | undefined;
  getAgent()
    .get(SEGMENT_ORIGIN)
    .intercept({
      path: (path) => path.startsWith(segmentPath),
      method: "GET",
    })
    .reply((request) => {
      authHeader = headerValue(request.headers, "authorization");
      return { statusCode: 200, data: body };
    });
  return () => authHeader;
}

describe("downloadAnalyticsReport", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "asc-analytics-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function mockSelectorChain(): void {
    mockAscList(
      (path) => path.startsWith("/v1/apps/app-1/analyticsReportRequests"),
      [requestResource({ id: "req-1" })],
    );
    mockAscList(
      (path) =>
        path.startsWith("/v1/analyticsReportRequests/req-1/reports") &&
        path.includes("filter[name]=App Downloads Standard"),
      [reportResource("rep-1", "App Downloads Standard")],
    );
    // Returned out of order on purpose: the latest processingDate must win.
    mockAscList(
      (path) => path.startsWith("/v1/analyticsReports/rep-1/instances"),
      [
        instanceResource("inst-old", "DAILY", "2026-06-10"),
        instanceResource("inst-new", "DAILY", "2026-06-11"),
      ],
    );
  }

  it("walks request → report → latest instance and lands every segment without auth", async () => {
    mockSelectorChain();
    const gz = gzipSync(ANALYTICS_SEGMENT_CSV);
    const gzMd5 = createHash("md5").update(gz).digest("hex");
    mockAscList(
      (path) =>
        path.startsWith("/v1/analyticsReportInstances/inst-new/segments"),
      [
        segmentResource("seg-0", `${SEGMENT_ORIGIN}/seg/0?sig=secret`, gzMd5),
        segmentResource(
          "seg-1",
          `${SEGMENT_ORIGIN}/seg/1?sig=secret`,
          "sha999:not-a-recognizable-checksum",
        ),
      ],
    );
    const authOf = mockSegmentBody("/seg/0", gz);
    mockSegmentBody("/seg/1", ANALYTICS_SEGMENT_CSV);
    const directory = join(dir, "out");

    const result = await downloadAnalyticsReport(
      client,
      {
        appId: "app-1",
        accessType: "ONGOING",
        reportName: "App Downloads Standard",
      },
      { directory },
    );

    // The critical security assertion: the Bearer token never reaches the
    // external segment host.
    expect(authOf()).toBeUndefined();
    expect(result.request.id).toBe("req-1");
    expect(result.report.id).toBe("rep-1");
    expect(result.instance.id).toBe("inst-new");
    expect(result.directory).toBe(directory);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toMatchObject({
      segmentId: "seg-0",
      path: join(directory, "segment-000.csv"),
      rows: 2,
      checksumVerified: true,
    });
    expect(result.segments[1]).toMatchObject({
      segmentId: "seg-1",
      path: join(directory, "segment-001.csv"),
      checksum: "sha999:not-a-recognizable-checksum",
      checksumVerified: false,
    });
    expect(await readFile(join(directory, "segment-000.csv"), "utf8")).toBe(
      ANALYTICS_SEGMENT_CSV,
    );
  });

  it("keeps a checksum mismatch as .corrupt evidence and fails the chain", async () => {
    mockSelectorChain();
    mockAscList(
      (path) =>
        path.startsWith("/v1/analyticsReportInstances/inst-new/segments"),
      [
        segmentResource(
          "seg-0",
          `${SEGMENT_ORIGIN}/seg/0?sig=secret`,
          "0".repeat(32),
        ),
      ],
    );
    mockSegmentBody("/seg/0", gzipSync(ANALYTICS_SEGMENT_CSV));
    const directory = join(dir, "out");

    const error = await thrownBy(
      downloadAnalyticsReport(
        client,
        {
          appId: "app-1",
          accessType: "ONGOING",
          reportName: "App Downloads Standard",
        },
        { directory },
      ),
    );

    expect(error).toBeInstanceOf(AscFileProcessingError);
    expect(error).toMatchObject({ stage: "checksum" });
    expect(
      await readFile(join(directory, "segment-000.csv.corrupt"), "utf8"),
    ).toBe(ANALYTICS_SEGMENT_CSV);
  });

  it("points at ensure-request when only stopped requests exist", async () => {
    mockAscList(
      (path) => path.startsWith("/v1/apps/app-1/analyticsReportRequests"),
      [requestResource({ id: "req-stopped", stopped: true })],
    );

    const error = await thrownBy(
      downloadAnalyticsReport(client, {
        appId: "app-1",
        accessType: "ONGOING",
        reportName: "App Downloads Standard",
      }),
    );

    expect(error).toBeInstanceOf(AscNotFoundError);
    expect(error.message).toContain("ensure-request");
    expect(error.message).toContain("1 stopped");
  });

  it("answers an unknown report name with the available names", async () => {
    mockAscList(
      (path) => path.startsWith("/v1/apps/app-1/analyticsReportRequests"),
      [requestResource({ id: "req-1" })],
    );
    mockAscList(
      (path) =>
        path.startsWith("/v1/analyticsReportRequests/req-1/reports") &&
        path.includes("filter[name]"),
      [],
    );
    mockAscList(
      (path) =>
        path.startsWith("/v1/analyticsReportRequests/req-1/reports") &&
        !path.includes("filter[name]"),
      [
        reportResource("rep-a", "App Downloads Standard"),
        reportResource("rep-b", "App Crashes Standard", "PERFORMANCE"),
      ],
    );

    const error = await thrownBy(
      downloadAnalyticsReport(client, {
        appId: "app-1",
        accessType: "ONGOING",
        reportName: "No Such Report",
      }),
    );

    expect(error).toBeInstanceOf(AscNotFoundError);
    expect(error.message).toContain("App Downloads Standard");
    expect(error.message).toContain("App Crashes Standard");
  });

  it("treats a multi-category name match as under-specification", async () => {
    mockAscList(
      (path) => path.startsWith("/v1/apps/app-1/analyticsReportRequests"),
      [requestResource({ id: "req-1" })],
    );
    mockAscList(
      (path) => path.startsWith("/v1/analyticsReportRequests/req-1/reports"),
      [
        reportResource("rep-a", "Sessions Standard", "APP_USAGE"),
        reportResource("rep-b", "Sessions Standard", "APP_STORE_ENGAGEMENT"),
      ],
    );

    const error = await thrownBy(
      downloadAnalyticsReport(client, {
        appId: "app-1",
        accessType: "ONGOING",
        reportName: "Sessions Standard",
      }),
    );

    expect(error).toBeInstanceOf(AscInvalidParameterError);
    expect(error.message).toContain("APP_USAGE, APP_STORE_ENGAGEMENT");
  });

  it("explains the 1-2 day wait when a report has no instances yet", async () => {
    mockAscList(
      (path) => path.startsWith("/v1/apps/app-1/analyticsReportRequests"),
      [requestResource({ id: "req-1" })],
    );
    mockAscList(
      (path) => path.startsWith("/v1/analyticsReportRequests/req-1/reports"),
      [reportResource("rep-1", "App Downloads Standard")],
    );
    mockAscList(
      (path) => path.startsWith("/v1/analyticsReports/rep-1/instances"),
      [],
    );

    const error = await thrownBy(
      downloadAnalyticsReport(client, {
        appId: "app-1",
        accessType: "ONGOING",
        reportName: "App Downloads Standard",
      }),
    );

    expect(error).toBeInstanceOf(AscNotFoundError);
    expect(error.message).toContain("1-2 days");
  });

  it("lists available instance coordinates when filters match nothing", async () => {
    mockAscList(
      (path) => path.startsWith("/v1/apps/app-1/analyticsReportRequests"),
      [requestResource({ id: "req-1" })],
    );
    mockAscList(
      (path) => path.startsWith("/v1/analyticsReportRequests/req-1/reports"),
      [reportResource("rep-1", "App Downloads Standard")],
    );
    mockAscList(
      (path) =>
        path.startsWith("/v1/analyticsReports/rep-1/instances") &&
        path.includes("filter[processingDate]"),
      [],
    );
    mockAscList(
      (path) =>
        path.startsWith("/v1/analyticsReports/rep-1/instances") &&
        !path.includes("filter[processingDate]"),
      [instanceResource("inst-1", "DAILY", "2026-06-10")],
    );

    const error = await thrownBy(
      downloadAnalyticsReport(client, {
        appId: "app-1",
        accessType: "ONGOING",
        reportName: "App Downloads Standard",
        processingDate: "2026-01-01",
      }),
    );

    expect(error).toBeInstanceOf(AscNotFoundError);
    expect(error.message).toContain("DAILY @ 2026-06-10");
  });
});

describe("downloadAnalyticsInstance", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "asc-analytics-inst-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("downloads a known instance's segments without walking the chain", async () => {
    mockAscList(
      (path) => path.startsWith("/v1/analyticsReportInstances/inst-9/segments"),
      [segmentResource("seg-0", `${SEGMENT_ORIGIN}/seg/9?sig=s`, "none")],
    );
    mockSegmentBody("/seg/9", ANALYTICS_SEGMENT_CSV);
    const directory = join(dir, "out");

    const result = await downloadAnalyticsInstance(client, "inst-9", directory);

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({
      segmentId: "seg-0",
      checksumVerified: false,
      rows: 2,
    });
  });

  it("reports an instance without segments as not found", async () => {
    mockAscList(
      (path) => path.startsWith("/v1/analyticsReportInstances/inst-9/segments"),
      [],
    );

    const error = await thrownBy(
      downloadAnalyticsInstance(client, "inst-9", join(dir, "out")),
    );

    expect(error).toBeInstanceOf(AscNotFoundError);
    expect(error.message).toContain("no downloadable segments");
  });
});
