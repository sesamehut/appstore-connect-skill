import { beforeAll, describe, expect, it } from "vitest";

import { loadAscCredentialsFromEnv } from "../src/auth/credentials.js";
import {
  AscError,
  AscPermissionError,
  AscRateLimitError,
  AscRateLimitFloorError,
  AscUpstreamError,
} from "../src/errors.js";
import type { AscApiErrorItem } from "../src/errors.js";
import { ASC_API_BASE_URL, createAscClient } from "../src/http/client.js";
import type { AscClient } from "../src/http/client.js";
import { paginate, readPaged } from "../src/pagination/paginate.js";
import { useMockAgent } from "./helpers/mock-agent.js";
import { makeTestKey } from "./helpers/test-credentials.js";

const getAgent = useMockAgent();

let client: AscClient;

beforeAll(async () => {
  const key = await makeTestKey();
  const credentials = await loadAscCredentialsFromEnv(key.envTeam);
  client = createAscClient({ credentials });
});

const JSON_HEADERS = { "content-type": "application/json" };
const HEALTHY_QUOTA = "user-hour-lim:3500;user-hour-rem:3000;";

/** A contract-shaped apps page; `nextQuery` becomes an absolute links.next. */
function appsPage(
  ids: readonly string[],
  options: { nextQuery?: string; nextRaw?: string; total?: number } = {},
): Record<string, unknown> {
  const next =
    options.nextRaw ??
    (options.nextQuery !== undefined
      ? `${ASC_API_BASE_URL}/v1/apps${options.nextQuery}`
      : undefined);
  return {
    data: ids.map((id) => ({ type: "apps", id })),
    links: {
      self: `${ASC_API_BASE_URL}/v1/apps`,
      ...(next !== undefined && { next }),
    },
    ...(options.total !== undefined && {
      meta: { paging: { limit: ids.length, total: options.total } },
    }),
  };
}

function interceptPage(options: {
  readonly path: string | ((path: string) => boolean);
  readonly body: object;
  readonly rateLimit?: string;
  readonly capture?: (path: string) => void;
}): void {
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({ path: options.path, method: "GET" })
    .reply((request) => {
      options.capture?.(request.path);
      return {
        statusCode: 200,
        data: options.body,
        responseOptions: {
          headers: {
            ...JSON_HEADERS,
            ...(options.rateLimit !== undefined && {
              "x-rate-limit": options.rateLimit,
            }),
          },
        },
      };
    });
}

async function thrownBy(promise: Promise<unknown>): Promise<AscError> {
  const thrown = await promise.then(
    () => expect.fail("expected the call to throw"),
    (error: unknown) => error,
  );
  expect(thrown).toBeInstanceOf(AscError);
  return thrown as AscError;
}

describe("multi-page reads", () => {
  it("follows links.next across a full read, in order", async () => {
    interceptPage({
      path: "/v1/apps?limit=2",
      body: appsPage(["1", "2"], { nextQuery: "?cursor=p2&limit=2", total: 5 }),
      rateLimit: HEALTHY_QUOTA,
    });
    interceptPage({
      path: "/v1/apps?cursor=p2&limit=2",
      body: appsPage(["3", "4"], { nextQuery: "?cursor=p3&limit=2", total: 5 }),
      rateLimit: HEALTHY_QUOTA,
    });
    interceptPage({
      path: "/v1/apps?cursor=p3&limit=2",
      body: appsPage(["5"], { total: 5 }),
    });

    const read = await readPaged(
      client,
      "/v1/apps",
      { params: { query: { limit: 2 } } },
      "all-pages",
    );

    expect(read.items.map((app) => app.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(read.pagesRead).toBe(3);
    expect(read.truncated).toBe(false);
    expect(read.total).toBe(5);
    // The last page carried no header; the latest snapshot wins.
    expect(read.rateLimit?.remaining).toBe(3000);
  });

  it("passes the next link's query string through verbatim", async () => {
    const nextQuery =
      "?cursor=eyJvZmZzZXQiOiIyIn0%3D&limit=1&fields%5Bapps%5D=bundleId";
    let capturedPath = "";
    interceptPage({
      path: (path) => path.startsWith("/v1/apps") && !path.includes("cursor"),
      body: appsPage(["1"], { nextQuery }),
    });
    interceptPage({
      path: (path) => path.includes("cursor"),
      body: appsPage(["2"]),
      capture: (path) => {
        capturedPath = path;
      },
    });

    await readPaged(
      client,
      "/v1/apps",
      { params: { query: { limit: 1, "fields[apps]": ["bundleId"] } } },
      "all-pages",
    );

    expect(capturedPath).toBe(`/v1/apps${nextQuery}`);
  });

  it("continues past the first page when it had no query parameters", async () => {
    interceptPage({
      path: "/v1/apps",
      body: appsPage(["1"], { nextQuery: "?cursor=p2" }),
    });
    interceptPage({ path: "/v1/apps?cursor=p2", body: appsPage(["2"]) });

    const read = await readPaged(client, "/v1/apps", {}, "all-pages");

    expect(read.pagesRead).toBe(2);
    expect(read.items).toHaveLength(2);
  });
});

describe("read scopes", () => {
  it("single-page issues exactly one request and reports truncation", async () => {
    interceptPage({
      path: "/v1/apps",
      body: appsPage(["1", "2"], { nextQuery: "?cursor=p2" }),
    });

    const read = await readPaged(client, "/v1/apps", {}, "single-page");

    expect(read.items).toHaveLength(2);
    expect(read.pagesRead).toBe(1);
    expect(read.truncated).toBe(true);
  });

  it("maxItems stops mid-page without fetching further pages", async () => {
    interceptPage({
      path: "/v1/apps",
      body: appsPage(["1", "2"], { nextQuery: "?cursor=p2" }),
    });
    interceptPage({
      path: "/v1/apps?cursor=p2",
      body: appsPage(["3", "4"], { nextQuery: "?cursor=p3" }),
    });

    const read = await readPaged(client, "/v1/apps", {}, { maxItems: 3 });

    expect(read.items.map((app) => app.id)).toEqual(["1", "2", "3"]);
    expect(read.pagesRead).toBe(2);
    expect(read.truncated).toBe(true);
  });

  it("maxItems aligned with a page boundary does not fetch the next page", async () => {
    interceptPage({
      path: "/v1/apps",
      body: appsPage(["1", "2"], { nextQuery: "?cursor=p2" }),
    });
    interceptPage({
      path: "/v1/apps?cursor=p2",
      body: appsPage(["3", "4"], { nextQuery: "?cursor=p3" }),
    });

    const read = await readPaged(client, "/v1/apps", {}, { maxItems: 4 });

    expect(read.items).toHaveLength(4);
    expect(read.pagesRead).toBe(2);
    expect(read.truncated).toBe(true);
  });

  it("rejects a non-positive maxItems before any request", async () => {
    await expect(
      readPaged(client, "/v1/apps", {}, { maxItems: 0 }),
    ).rejects.toThrow(RangeError);
  });
});

describe("failed pages", () => {
  it("keeps category, errors, and progress; earlier pages stay delivered", async () => {
    const item: AscApiErrorItem = {
      code: "FORBIDDEN_ERROR",
      status: "403",
      title: "Forbidden",
      detail: "The key cannot read this resource",
    };
    interceptPage({
      path: "/v1/apps",
      body: appsPage(["1", "2"], { nextQuery: "?cursor=p2" }),
    });
    interceptPage({
      path: "/v1/apps?cursor=p2",
      body: appsPage(["3", "4"], { nextQuery: "?cursor=p3" }),
    });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps?cursor=p3", method: "GET" })
      .reply(403, { errors: [item] });

    const deliveredCounts: number[] = [];
    let thrown: unknown;
    try {
      for await (const page of paginate(client, "/v1/apps", {})) {
        deliveredCounts.push(page.document.data.length);
      }
    } catch (error) {
      thrown = error;
    }

    expect(deliveredCounts).toEqual([2, 2]);
    expect(thrown).toBeInstanceOf(AscPermissionError);
    const error = thrown as AscPermissionError;
    expect(error.category).toBe("permission");
    expect(error.apiErrors).toEqual([item]);
    expect(error.pagination).toEqual({ pagesRead: 2, itemsRead: 4 });
  });
});

describe("quota floor guard", () => {
  it("stops before spending the next page once remaining drops below the floor", async () => {
    interceptPage({
      path: "/v1/apps",
      body: appsPage(["1", "2"], { nextQuery: "?cursor=p2" }),
      rateLimit: "user-hour-lim:3500;user-hour-rem:50;",
    });

    const error = await thrownBy(
      readPaged(client, "/v1/apps", {}, "all-pages"),
    );

    expect(error).toBeInstanceOf(AscRateLimitFloorError);
    expect(error).toBeInstanceOf(AscRateLimitError);
    expect(error.category).toBe("rate-limit");
    expect((error as AscRateLimitFloorError).floor).toBe(100);
    expect(error.rateLimit?.remaining).toBe(50);
    expect(error.pagination).toEqual({ pagesRead: 1, itemsRead: 2 });
  });

  it("rateLimitFloor: 0 disables the guard", async () => {
    interceptPage({
      path: "/v1/apps",
      body: appsPage(["1"], { nextQuery: "?cursor=p2" }),
      rateLimit: "user-hour-lim:3500;user-hour-rem:1;",
    });
    interceptPage({
      path: "/v1/apps?cursor=p2",
      body: appsPage(["2"]),
      rateLimit: "user-hour-lim:3500;user-hour-rem:0;",
    });

    const read = await readPaged(client, "/v1/apps", {}, "all-pages", {
      rateLimitFloor: 0,
    });

    expect(read.pagesRead).toBe(2);
  });

  it("never blocks a final page, and an absent header never trips it", async () => {
    interceptPage({
      path: "/v1/apps",
      body: appsPage(["1"], { nextQuery: "?cursor=p2" }),
    });
    interceptPage({
      path: "/v1/apps?cursor=p2",
      body: appsPage(["2"]),
      rateLimit: "user-hour-lim:3500;user-hour-rem:1;",
    });

    const read = await readPaged(client, "/v1/apps", {}, "all-pages");

    expect(read.pagesRead).toBe(2);
    expect(read.rateLimit?.remaining).toBe(1);
  });
});

describe("upstream drift", () => {
  it("rejects a malformed next link, with progress attached", async () => {
    interceptPage({
      path: "/v1/apps",
      body: appsPage(["1"], { nextRaw: "::not-a-url::" }),
    });

    const error = await thrownBy(
      readPaged(client, "/v1/apps", {}, "all-pages"),
    );

    expect(error).toBeInstanceOf(AscUpstreamError);
    expect(error.pagination).toEqual({ pagesRead: 1, itemsRead: 1 });
  });

  it("rejects a repeated identical cursor instead of looping", async () => {
    interceptPage({
      path: "/v1/apps",
      body: appsPage(["1"], { nextQuery: "?cursor=loop" }),
    });
    interceptPage({
      path: "/v1/apps?cursor=loop",
      body: appsPage(["2"], { nextQuery: "?cursor=loop" }),
    });

    const error = await thrownBy(
      readPaged(client, "/v1/apps", {}, "all-pages"),
    );

    expect(error).toBeInstanceOf(AscUpstreamError);
    expect(error.pagination).toEqual({ pagesRead: 2, itemsRead: 2 });
  });

  it("rejects a response that is not a collection envelope", async () => {
    interceptPage({
      path: "/v1/apps",
      body: {
        data: { type: "apps", id: "1" },
        links: { self: `${ASC_API_BASE_URL}/v1/apps` },
      },
    });

    const error = await thrownBy(
      readPaged(client, "/v1/apps", {}, "single-page"),
    );

    expect(error).toBeInstanceOf(AscUpstreamError);
    expect(error.pagination).toEqual({ pagesRead: 0, itemsRead: 0 });
  });
});
