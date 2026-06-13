import { beforeAll, describe, expect, it } from "vitest";

import {
  getCrashFeedback,
  getCrashLog,
  getScreenshotFeedback,
  listCrashFeedback,
  listScreenshotFeedback,
} from "../src/capabilities/testflight-feedback.js";
import { ASC_API_BASE_URL } from "../src/http/client.js";
import type { AscClient } from "../src/http/client.js";
import { JSON_HEADERS, makeOfflineClient } from "./helpers/asc-fixtures.js";
import { useMockAgent } from "./helpers/mock-agent.js";

const getAgent = useMockAgent();

let client: AscClient;

beforeAll(async () => {
  client = await makeOfflineClient();
});

function captureGet(prefix: string, data: object | string): () => string {
  let capturedPath = "";
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({ path: (path) => path.startsWith(prefix), method: "GET" })
    .reply((request) => {
      capturedPath = request.path;
      return {
        statusCode: 200,
        data,
        responseOptions: { headers: JSON_HEADERS },
      };
    });
  return () => capturedPath;
}

function listBody(items: readonly unknown[]) {
  return { data: items, links: { self: `${ASC_API_BASE_URL}/v1/list` } };
}

describe("listCrashFeedback", () => {
  it("reads the app-scoped collection with build/tester/device/os filters and sort", async () => {
    const pathOf = captureGet(
      "/v1/apps/app-1/betaFeedbackCrashSubmissions",
      listBody([{ type: "betaFeedbackCrashSubmissions", id: "c1" }]),
    );

    const read = await listCrashFeedback(client, "app-1", {
      scope: "single-page",
      build: ["b1"],
      tester: ["t1"],
      deviceModel: ["iPhone15,3"],
      osVersion: ["17.0"],
      sort: ["-createdDate"],
    });

    const query = new URLSearchParams(pathOf().split("?")[1] ?? "");
    expect(query.get("filter[build]")).toBe("b1");
    expect(query.get("filter[tester]")).toBe("t1");
    expect(query.get("filter[deviceModel]")).toBe("iPhone15,3");
    expect(query.get("filter[osVersion]")).toBe("17.0");
    expect(query.get("sort")).toBe("-createdDate");
    expect(read.items.map((c) => c.id)).toEqual(["c1"]);
  });
});

describe("listScreenshotFeedback", () => {
  it("reads the app-scoped screenshot collection with filters", async () => {
    const pathOf = captureGet(
      "/v1/apps/app-1/betaFeedbackScreenshotSubmissions",
      listBody([{ type: "betaFeedbackScreenshotSubmissions", id: "s1" }]),
    );

    await listScreenshotFeedback(client, "app-1", {
      scope: "single-page",
      build: ["b1"],
    });

    const query = new URLSearchParams(pathOf().split("?")[1] ?? "");
    expect(query.get("filter[build]")).toBe("b1");
    expect(
      pathOf().startsWith("/v1/apps/app-1/betaFeedbackScreenshotSubmissions"),
    ).toBe(true);
  });
});

describe("getCrashFeedback / getCrashLog", () => {
  it("reads one crash submission with include", async () => {
    const pathOf = captureGet("/v1/betaFeedbackCrashSubmissions/c1", {
      data: { type: "betaFeedbackCrashSubmissions", id: "c1" },
      links: { self: `${ASC_API_BASE_URL}/v1/betaFeedbackCrashSubmissions/c1` },
    });

    await getCrashFeedback(client, "c1", { include: ["build", "tester"] });

    const query = new URLSearchParams(pathOf().split("?")[1] ?? "");
    expect(query.get("include")).toBe("build,tester");
  });

  it("reads the inlined crash log text under the crashLog to-one path", async () => {
    const pathOf = captureGet("/v1/betaFeedbackCrashSubmissions/c1/crashLog", {
      data: {
        type: "betaCrashLogs",
        id: "log-1",
        attributes: { logText: "Thread 0 crashed" },
      },
      links: {
        self: `${ASC_API_BASE_URL}/v1/betaFeedbackCrashSubmissions/c1/crashLog`,
      },
    });

    const document = await getCrashLog(client, "c1");

    expect(
      pathOf().startsWith("/v1/betaFeedbackCrashSubmissions/c1/crashLog"),
    ).toBe(true);
    expect(document.data.attributes?.logText).toBe("Thread 0 crashed");
  });
});

describe("getScreenshotFeedback", () => {
  it("reads one screenshot submission carrying inline signed image URLs", async () => {
    captureGet("/v1/betaFeedbackScreenshotSubmissions/s1", {
      data: {
        type: "betaFeedbackScreenshotSubmissions",
        id: "s1",
        attributes: {
          screenshots: [
            {
              url: "https://cdn.example.test/img.png?sig=secret",
              expirationDate: "2026-06-13T00:00:00Z",
              width: 100,
              height: 200,
            },
          ],
        },
      },
      links: {
        self: `${ASC_API_BASE_URL}/v1/betaFeedbackScreenshotSubmissions/s1`,
      },
    });

    const document = await getScreenshotFeedback(client, "s1");

    expect(document.data.attributes?.screenshots?.[0]?.width).toBe(100);
  });
});
