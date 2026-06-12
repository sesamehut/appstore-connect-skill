import { beforeAll, describe, expect, it } from "vitest";

import { getApp, listApps } from "../src/capabilities/apps.js";
import { listAppStoreVersions } from "../src/capabilities/app-store-versions.js";
import { AscNotFoundError, AscPermissionError } from "../src/errors.js";
import { ASC_API_BASE_URL } from "../src/http/client.js";
import type { AscClient } from "../src/http/client.js";
import {
  ascItem,
  JSON_HEADERS,
  makeOfflineClient,
  thrownBy,
} from "./helpers/asc-fixtures.js";
import { useMockAgent } from "./helpers/mock-agent.js";

const getAgent = useMockAgent();

let client: AscClient;

beforeAll(async () => {
  client = await makeOfflineClient();
});

describe("listApps", () => {
  it("maps options onto the JSON:API query surface", async () => {
    let capturedPath = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: (path) => path.startsWith("/v1/apps"), method: "GET" })
      .reply((request) => {
        capturedPath = request.path;
        return {
          statusCode: 200,
          data: {
            data: [{ type: "apps", id: "100" }],
            links: { self: `${ASC_API_BASE_URL}/v1/apps` },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const read = await listApps(client, {
      scope: "single-page",
      pageLimit: 2,
      bundleId: ["com.example.one", "com.example.two"],
      fields: ["name", "bundleId"],
      sort: ["name"],
    });

    const query = new URLSearchParams(capturedPath.split("?")[1] ?? "");
    expect(query.get("limit")).toBe("2");
    expect(query.get("filter[bundleId]")).toBe(
      "com.example.one,com.example.two",
    );
    expect(query.get("fields[apps]")).toBe("name,bundleId");
    expect(query.get("sort")).toBe("name");
    expect(read.items.map((app) => app.id)).toEqual(["100"]);
    expect(read.truncated).toBe(false);
  });

  it("reads all pages end to end through the pagination layer", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps?limit=1", method: "GET" })
      .reply(
        200,
        {
          data: [{ type: "apps", id: "1" }],
          links: {
            self: `${ASC_API_BASE_URL}/v1/apps`,
            next: `${ASC_API_BASE_URL}/v1/apps?cursor=p2&limit=1`,
          },
          meta: { paging: { limit: 1, total: 2 } },
        },
        { headers: JSON_HEADERS },
      );
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps?cursor=p2&limit=1", method: "GET" })
      .reply(
        200,
        {
          data: [{ type: "apps", id: "2" }],
          links: { self: `${ASC_API_BASE_URL}/v1/apps` },
          meta: { paging: { limit: 1, total: 2 } },
        },
        { headers: JSON_HEADERS },
      );

    const read = await listApps(client, { scope: "all-pages", pageLimit: 1 });

    expect(read.items.map((app) => app.id)).toEqual(["1", "2"]);
    expect(read.pagesRead).toBe(2);
    expect(read.total).toBe(2);
    expect(read.truncated).toBe(false);
  });
});

describe("getApp", () => {
  it("substitutes the path id and maps the field selection", async () => {
    let capturedPath = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) => path.startsWith("/v1/apps/123"),
        method: "GET",
      })
      .reply((request) => {
        capturedPath = request.path;
        return {
          statusCode: 200,
          data: {
            data: {
              type: "apps",
              id: "123",
              attributes: { name: "Example", bundleId: "com.example.one" },
            },
            links: { self: `${ASC_API_BASE_URL}/v1/apps/123` },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const document = await getApp(client, "123", {
      fields: ["name", "bundleId"],
    });

    expect(capturedPath).toBe("/v1/apps/123?fields[apps]=name,bundleId");
    expect(document.data.id).toBe("123");
    expect(document.data.attributes?.name).toBe("Example");
  });

  it("surfaces 404 as not-found, undisguised", async () => {
    const item = ascItem({ code: "NOT_FOUND", status: "404" });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps/999", method: "GET" })
      .reply(404, { errors: [item] });

    const error = await thrownBy(getApp(client, "999"));

    expect(error).toBeInstanceOf(AscNotFoundError);
    expect(error.category).toBe("not-found");
    expect(error.apiErrors).toEqual([item]);
  });
});

describe("listAppStoreVersions", () => {
  it("filters by platform and state, and keeps the app id across pages", async () => {
    let firstPath = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) =>
          path.startsWith("/v1/apps/123/appStoreVersions") &&
          !path.includes("cursor"),
        method: "GET",
      })
      .reply((request) => {
        firstPath = request.path;
        return {
          statusCode: 200,
          data: {
            data: [
              {
                type: "appStoreVersions",
                id: "v1",
                attributes: { versionString: "1.0.0", platform: "IOS" },
              },
            ],
            links: {
              self: `${ASC_API_BASE_URL}/v1/apps/123/appStoreVersions`,
              next: `${ASC_API_BASE_URL}/v1/apps/123/appStoreVersions?cursor=v2`,
            },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: "/v1/apps/123/appStoreVersions?cursor=v2",
        method: "GET",
      })
      .reply(
        200,
        {
          data: [{ type: "appStoreVersions", id: "v2" }],
          links: {
            self: `${ASC_API_BASE_URL}/v1/apps/123/appStoreVersions`,
          },
        },
        { headers: JSON_HEADERS },
      );

    const read = await listAppStoreVersions(client, "123", {
      scope: "all-pages",
      platform: ["IOS"],
      appVersionState: ["READY_FOR_DISTRIBUTION"],
    });

    const query = new URLSearchParams(firstPath.split("?")[1] ?? "");
    expect(query.get("filter[platform]")).toBe("IOS");
    expect(query.get("filter[appVersionState]")).toBe("READY_FOR_DISTRIBUTION");
    expect(read.items.map((version) => version.id)).toEqual(["v1", "v2"]);
    expect(read.pagesRead).toBe(2);
  });

  it("surfaces 403 as permission, distinguishable from not-found", async () => {
    const item = ascItem({ code: "FORBIDDEN_ERROR", status: "403" });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: "/v1/apps/123/appStoreVersions",
        method: "GET",
      })
      .reply(403, { errors: [item] });

    const error = await thrownBy(
      listAppStoreVersions(client, "123", { scope: "single-page" }),
    );

    expect(error).toBeInstanceOf(AscPermissionError);
    expect(error).not.toBeInstanceOf(AscNotFoundError);
    expect(error.category).toBe("permission");
    expect(error.apiErrors).toEqual([item]);
  });
});
