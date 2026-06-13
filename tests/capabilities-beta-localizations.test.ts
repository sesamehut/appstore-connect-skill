import { beforeAll, describe, expect, it } from "vitest";

import {
  createBetaAppLocalization,
  createBetaBuildLocalization,
  deleteBetaAppLocalization,
  deleteBetaBuildLocalization,
  listBetaAppLocalizations,
  listBetaBuildLocalizations,
  updateBetaAppLocalization,
  updateBetaBuildLocalization,
} from "../src/capabilities/beta-localizations.js";
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

function captureWrite(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  status: number,
  data: object | string,
): () => string | undefined {
  let capturedBody: string | undefined;
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({ path, method })
    .reply((request) => {
      capturedBody = request.body as string | undefined;
      return {
        statusCode: status,
        data,
        responseOptions: { headers: JSON_HEADERS },
      };
    });
  return () => capturedBody;
}

function listBody(items: readonly unknown[]) {
  return { data: items, links: { self: `${ASC_API_BASE_URL}/v1/list` } };
}

describe("betaBuildLocalizations", () => {
  it("lists with build + locale filters", async () => {
    const pathOf = captureGet(
      "/v1/betaBuildLocalizations",
      listBody([{ type: "betaBuildLocalizations", id: "l1" }]),
    );

    await listBetaBuildLocalizations(client, {
      scope: "single-page",
      build: ["b1"],
      locale: ["en-US"],
    });

    const query = new URLSearchParams(pathOf().split("?")[1] ?? "");
    expect(query.get("filter[build]")).toBe("b1");
    expect(query.get("filter[locale]")).toBe("en-US");
  });

  it("creates with the build relationship and locale + whatsNew", async () => {
    const bodyOf = captureWrite("POST", "/v1/betaBuildLocalizations", 201, {
      data: { type: "betaBuildLocalizations", id: "l-new" },
      links: { self: `${ASC_API_BASE_URL}/v1/betaBuildLocalizations/l-new` },
    });

    await createBetaBuildLocalization(client, "b1", {
      locale: "en-US",
      whatsNew: "Try the new flow",
    });

    expect(JSON.parse(bodyOf() ?? "{}")).toEqual({
      data: {
        type: "betaBuildLocalizations",
        attributes: { locale: "en-US", whatsNew: "Try the new flow" },
        relationships: { build: { data: { type: "builds", id: "b1" } } },
      },
    });
  });

  it("updates whatsNew keyed by id (locale not carried)", async () => {
    const bodyOf = captureWrite("PATCH", "/v1/betaBuildLocalizations/l1", 200, {
      data: { type: "betaBuildLocalizations", id: "l1" },
      links: { self: `${ASC_API_BASE_URL}/v1/betaBuildLocalizations/l1` },
    });

    await updateBetaBuildLocalization(client, "l1", { whatsNew: "Updated" });

    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: { id: string; attributes: Record<string, unknown> };
    };
    expect(body.data.id).toBe("l1");
    expect(body.data.attributes).toEqual({ whatsNew: "Updated" });
    expect(body.data.attributes).not.toHaveProperty("locale");
  });

  it("deletes by id", async () => {
    let seen = false;
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/betaBuildLocalizations/l1", method: "DELETE" })
      .reply(() => {
        seen = true;
        return { statusCode: 204, data: "" };
      });

    await deleteBetaBuildLocalization(client, "l1");

    expect(seen).toBe(true);
  });
});

describe("betaAppLocalizations", () => {
  it("lists with app + locale filters", async () => {
    const pathOf = captureGet(
      "/v1/betaAppLocalizations",
      listBody([{ type: "betaAppLocalizations", id: "a1" }]),
    );

    await listBetaAppLocalizations(client, {
      scope: "single-page",
      app: ["app-1"],
      locale: ["en-US"],
    });

    const query = new URLSearchParams(pathOf().split("?")[1] ?? "");
    expect(query.get("filter[app]")).toBe("app-1");
    expect(query.get("filter[locale]")).toBe("en-US");
  });

  it("creates with the app relationship and the metadata attributes", async () => {
    const bodyOf = captureWrite("POST", "/v1/betaAppLocalizations", 201, {
      data: { type: "betaAppLocalizations", id: "a-new" },
      links: { self: `${ASC_API_BASE_URL}/v1/betaAppLocalizations/a-new` },
    });

    await createBetaAppLocalization(client, "app-1", {
      locale: "en-US",
      description: "Beta build",
      feedbackEmail: "beta@x.com",
    });

    expect(JSON.parse(bodyOf() ?? "{}")).toEqual({
      data: {
        type: "betaAppLocalizations",
        attributes: {
          locale: "en-US",
          description: "Beta build",
          feedbackEmail: "beta@x.com",
        },
        relationships: { app: { data: { type: "apps", id: "app-1" } } },
      },
    });
  });

  it("updates mutable fields keyed by id (locale immutable)", async () => {
    const bodyOf = captureWrite("PATCH", "/v1/betaAppLocalizations/a1", 200, {
      data: { type: "betaAppLocalizations", id: "a1" },
      links: { self: `${ASC_API_BASE_URL}/v1/betaAppLocalizations/a1` },
    });

    await updateBetaAppLocalization(client, "a1", {
      description: "Changed",
    });

    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: { id: string; attributes: Record<string, unknown> };
    };
    expect(body.data.id).toBe("a1");
    expect(body.data.attributes).toEqual({ description: "Changed" });
    expect(body.data.attributes).not.toHaveProperty("locale");
  });

  it("deletes by id", async () => {
    let seen = false;
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/betaAppLocalizations/a1", method: "DELETE" })
      .reply(() => {
        seen = true;
        return { statusCode: 204, data: "" };
      });

    await deleteBetaAppLocalization(client, "a1");

    expect(seen).toBe(true);
  });
});
