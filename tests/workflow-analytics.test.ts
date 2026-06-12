import { beforeEach, describe, expect, it } from "vitest";

import { ASC_API_BASE_URL } from "../src/http/client.js";
import type { AscClient } from "../src/http/client.js";
import { ensureAnalyticsReportRequest } from "../src/workflows/analytics-reports.js";
import { JSON_HEADERS, makeOfflineClient } from "./helpers/asc-fixtures.js";
import { useMockAgent } from "./helpers/mock-agent.js";

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
