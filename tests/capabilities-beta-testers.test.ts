import { beforeAll, describe, expect, it } from "vitest";

import {
  createBetaTester,
  deleteBetaTester,
  getBetaTester,
  listBetaTesters,
  removeTesterFromApp,
} from "../src/capabilities/beta-testers.js";
import { ASC_API_BASE_URL } from "../src/http/client.js";
import type { AscClient } from "../src/http/client.js";
import { JSON_HEADERS, makeOfflineClient } from "./helpers/asc-fixtures.js";
import { useMockAgent } from "./helpers/mock-agent.js";

const getAgent = useMockAgent();

let client: AscClient;

beforeAll(async () => {
  client = await makeOfflineClient();
});

function tester(id: string, email: string) {
  return { type: "betaTesters" as const, id, attributes: { email } };
}

describe("listBetaTesters", () => {
  it("maps every filter (apps/groups/builds/email/inviteType) and sort", async () => {
    let capturedPath = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) => path.startsWith("/v1/betaTesters"),
        method: "GET",
      })
      .reply((request) => {
        capturedPath = request.path;
        return {
          statusCode: 200,
          data: {
            data: [tester("t1", "a@x.com")],
            links: { self: `${ASC_API_BASE_URL}/v1/betaTesters` },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const read = await listBetaTesters(client, {
      scope: "single-page",
      apps: ["app-1"],
      betaGroups: ["g1"],
      builds: ["b1"],
      email: ["a@x.com"],
      inviteType: ["EMAIL"],
      sort: ["-email"],
    });

    const query = new URLSearchParams(capturedPath.split("?")[1] ?? "");
    expect(query.get("filter[apps]")).toBe("app-1");
    expect(query.get("filter[betaGroups]")).toBe("g1");
    expect(query.get("filter[builds]")).toBe("b1");
    expect(query.get("filter[email]")).toBe("a@x.com");
    expect(query.get("filter[inviteType]")).toBe("EMAIL");
    expect(query.get("sort")).toBe("-email");
    expect(read.items.map((t) => t.id)).toEqual(["t1"]);
  });
});

describe("getBetaTester", () => {
  it("maps include onto a single-tester read", async () => {
    let capturedPath = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) => path.startsWith("/v1/betaTesters/t1"),
        method: "GET",
      })
      .reply((request) => {
        capturedPath = request.path;
        return {
          statusCode: 200,
          data: {
            data: tester("t1", "a@x.com"),
            links: { self: `${ASC_API_BASE_URL}/v1/betaTesters/t1` },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    await getBetaTester(client, "t1", { include: ["apps", "betaGroups"] });

    const query = new URLSearchParams(capturedPath.split("?")[1] ?? "");
    expect(query.get("include")).toBe("apps,betaGroups");
  });
});

describe("createBetaTester", () => {
  it("creates a bare tester with no relationships block when none given", async () => {
    let capturedBody = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/betaTesters", method: "POST" })
      .reply((request) => {
        capturedBody = request.body as string;
        return {
          statusCode: 201,
          data: {
            data: tester("t-new", "a@x.com"),
            links: { self: `${ASC_API_BASE_URL}/v1/betaTesters/t-new` },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    await createBetaTester(client, { email: "a@x.com" });

    const body = JSON.parse(capturedBody) as { data: Record<string, unknown> };
    expect(body.data).toEqual({
      type: "betaTesters",
      attributes: { email: "a@x.com" },
    });
    expect(body.data).not.toHaveProperty("relationships");
  });

  it("links groups and builds as relationship arrays when supplied", async () => {
    let capturedBody = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/betaTesters", method: "POST" })
      .reply((request) => {
        capturedBody = request.body as string;
        return {
          statusCode: 201,
          data: {
            data: tester("t-new", "b@x.com"),
            links: { self: `${ASC_API_BASE_URL}/v1/betaTesters/t-new` },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    await createBetaTester(
      client,
      { email: "b@x.com", firstName: "Ada" },
      { betaGroupIds: ["g1"], buildIds: ["b1", "b2"] },
    );

    expect(JSON.parse(capturedBody)).toEqual({
      data: {
        type: "betaTesters",
        attributes: { email: "b@x.com", firstName: "Ada" },
        relationships: {
          betaGroups: { data: [{ type: "betaGroups", id: "g1" }] },
          builds: {
            data: [
              { type: "builds", id: "b1" },
              { type: "builds", id: "b2" },
            ],
          },
        },
      },
    });
  });
});

describe("deleteBetaTester", () => {
  it("accepts the asynchronous 202 without asserting immediate consistency", async () => {
    // Apple answers account-level tester deletes with 202 (async). The
    // capability must not choke on a 202 (vs 204) — both mean "accepted".
    let seen = false;
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/betaTesters/t1", method: "DELETE" })
      .reply(() => {
        seen = true;
        return { statusCode: 202, data: "" };
      });

    await expect(deleteBetaTester(client, "t1")).resolves.toBeUndefined();
    expect(seen).toBe(true);
  });
});

describe("removeTesterFromApp", () => {
  it("DELETEs an apps linkage array on the tester-side relationship", async () => {
    let capturedBody = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: "/v1/betaTesters/t1/relationships/apps",
        method: "DELETE",
      })
      .reply((request) => {
        capturedBody = request.body as string;
        // 202 async per the plan's key findings.
        return { statusCode: 202, data: "" };
      });

    await removeTesterFromApp(client, "t1", ["app-1", "app-2"]);

    expect(JSON.parse(capturedBody)).toEqual({
      data: [
        { type: "apps", id: "app-1" },
        { type: "apps", id: "app-2" },
      ],
    });
  });
});
