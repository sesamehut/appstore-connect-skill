import { beforeAll, describe, expect, it } from "vitest";

import {
  addTestersToGroup,
  checkRecruitmentCompatibleBuild,
  clearRecruitmentCriteria,
  createBetaGroup,
  deleteBetaGroup,
  getBetaGroup,
  listBetaGroups,
  listGroupBuilds,
  listGroupTesters,
  listRecruitmentCriterionOptions,
  readRecruitmentCriteria,
  removeTestersFromGroup,
  setPublicLink,
  setRecruitmentCriteria,
  updateBetaGroup,
} from "../src/capabilities/beta-groups.js";
import { ASC_API_BASE_URL } from "../src/http/client.js";
import type { AscClient } from "../src/http/client.js";
import { JSON_HEADERS, makeOfflineClient } from "./helpers/asc-fixtures.js";
import { useMockAgent } from "./helpers/mock-agent.js";

const getAgent = useMockAgent();

let client: AscClient;

beforeAll(async () => {
  client = await makeOfflineClient();
});

/** Registers a GET interceptor and exposes the captured request path. */
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

/** Registers a write interceptor (POST/PATCH/DELETE) and captures the body. */
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

function group(id: string, name: string) {
  return { type: "betaGroups" as const, id, attributes: { name } };
}

function listBody(items: readonly unknown[]) {
  return { data: items, links: { self: `${ASC_API_BASE_URL}/v1/list` } };
}

describe("listBetaGroups", () => {
  it("maps app/name/internal filters and sort onto the query surface", async () => {
    const pathOf = captureGet(
      "/v1/betaGroups",
      listBody([group("g1", "Friends")]),
    );

    const read = await listBetaGroups(client, {
      scope: "single-page",
      app: ["app-1"],
      name: ["Friends"],
      isInternalGroup: ["false"],
      sort: ["name"],
      fields: ["name", "isInternalGroup"],
    });

    const query = new URLSearchParams(pathOf().split("?")[1] ?? "");
    expect(query.get("filter[app]")).toBe("app-1");
    expect(query.get("filter[name]")).toBe("Friends");
    expect(query.get("filter[isInternalGroup]")).toBe("false");
    expect(query.get("sort")).toBe("name");
    expect(query.get("fields[betaGroups]")).toBe("name,isInternalGroup");
    expect(read.items.map((g) => g.id)).toEqual(["g1"]);
  });
});

describe("getBetaGroup", () => {
  it("maps include onto a single-group read", async () => {
    const pathOf = captureGet("/v1/betaGroups/g1", {
      data: group("g1", "Friends"),
      links: { self: `${ASC_API_BASE_URL}/v1/betaGroups/g1` },
    });

    const document = await getBetaGroup(client, "g1", {
      include: ["app", "betaTesters"],
    });

    const query = new URLSearchParams(pathOf().split("?")[1] ?? "");
    expect(query.get("include")).toBe("app,betaTesters");
    expect(document.data.id).toBe("g1");
  });
});

describe("createBetaGroup", () => {
  it("sends create-only attributes and the app relationship in the body", async () => {
    const bodyOf = captureWrite("POST", "/v1/betaGroups", 201, {
      data: group("g-new", "External"),
      links: { self: `${ASC_API_BASE_URL}/v1/betaGroups/g-new` },
    });

    const document = await createBetaGroup(client, "app-1", {
      name: "External",
      isInternalGroup: false,
      hasAccessToAllBuilds: true,
    });

    expect(JSON.parse(bodyOf() ?? "{}")).toEqual({
      data: {
        type: "betaGroups",
        attributes: {
          name: "External",
          isInternalGroup: false,
          hasAccessToAllBuilds: true,
        },
        relationships: {
          app: { data: { type: "apps", id: "app-1" } },
        },
      },
    });
    expect(document.data.id).toBe("g-new");
  });
});

describe("updateBetaGroup", () => {
  it("never carries create-only fields and patches by id", async () => {
    const bodyOf = captureWrite("PATCH", "/v1/betaGroups/g1", 200, {
      data: group("g1", "Renamed"),
      links: { self: `${ASC_API_BASE_URL}/v1/betaGroups/g1` },
    });

    await updateBetaGroup(client, "g1", { name: "Renamed" });

    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: { id: string; attributes: Record<string, unknown> };
    };
    expect(body.data.id).toBe("g1");
    expect(body.data.attributes).toEqual({ name: "Renamed" });
    // The update request type omits these by contract; assert they cannot leak.
    expect(body.data.attributes).not.toHaveProperty("isInternalGroup");
    expect(body.data.attributes).not.toHaveProperty("hasAccessToAllBuilds");
  });
});

describe("deleteBetaGroup", () => {
  it("issues a DELETE on the group id", async () => {
    let seen = false;
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/betaGroups/g1", method: "DELETE" })
      .reply(() => {
        seen = true;
        return { statusCode: 204, data: "" };
      });

    await deleteBetaGroup(client, "g1");

    expect(seen).toBe(true);
  });
});

describe("listGroupTesters / listGroupBuilds", () => {
  it("reads testers under the group path", async () => {
    const pathOf = captureGet(
      "/v1/betaGroups/g1/betaTesters",
      listBody([{ type: "betaTesters", id: "t1" }]),
    );

    const read = await listGroupTesters(client, "g1", { scope: "single-page" });

    expect(pathOf().startsWith("/v1/betaGroups/g1/betaTesters")).toBe(true);
    expect(read.items.map((t) => t.id)).toEqual(["t1"]);
  });

  it("reads builds under the group path (visibility only)", async () => {
    const pathOf = captureGet(
      "/v1/betaGroups/g1/builds",
      listBody([{ type: "builds", id: "b1" }]),
    );

    const read = await listGroupBuilds(client, "g1", { scope: "single-page" });

    expect(pathOf().startsWith("/v1/betaGroups/g1/builds")).toBe(true);
    expect(read.items.map((b) => b.id)).toEqual(["b1"]);
  });
});

describe("addTestersToGroup / removeTestersFromGroup", () => {
  it("POSTs a betaTesters linkage array (group-side canonical edit)", async () => {
    const bodyOf = captureWrite(
      "POST",
      "/v1/betaGroups/g1/relationships/betaTesters",
      204,
      "",
    );

    await addTestersToGroup(client, "g1", ["t1", "t2"]);

    expect(JSON.parse(bodyOf() ?? "{}")).toEqual({
      data: [
        { type: "betaTesters", id: "t1" },
        { type: "betaTesters", id: "t2" },
      ],
    });
  });

  it("DELETEs the same linkage shape to remove testers", async () => {
    const bodyOf = captureWrite(
      "DELETE",
      "/v1/betaGroups/g1/relationships/betaTesters",
      204,
      "",
    );

    await removeTestersFromGroup(client, "g1", ["t9"]);

    expect(JSON.parse(bodyOf() ?? "{}")).toEqual({
      data: [{ type: "betaTesters", id: "t9" }],
    });
  });
});

describe("setPublicLink", () => {
  it("patches publicLink attributes through the update path", async () => {
    const bodyOf = captureWrite("PATCH", "/v1/betaGroups/g1", 200, {
      data: group("g1", "External"),
      links: { self: `${ASC_API_BASE_URL}/v1/betaGroups/g1` },
    });

    await setPublicLink(client, "g1", {
      enabled: true,
      limitEnabled: true,
      limit: 100,
    });

    expect(JSON.parse(bodyOf() ?? "{}")).toEqual({
      data: {
        type: "betaGroups",
        id: "g1",
        attributes: {
          publicLinkEnabled: true,
          publicLinkLimitEnabled: true,
          publicLinkLimit: 100,
        },
      },
    });
  });
});

describe("recruitment criteria", () => {
  it("reads the group-side to-one criterion", async () => {
    captureGet("/v1/betaGroups/g1/betaRecruitmentCriteria", {
      data: { type: "betaRecruitmentCriteria", id: "c1", attributes: {} },
      links: {
        self: `${ASC_API_BASE_URL}/v1/betaGroups/g1/betaRecruitmentCriteria`,
      },
    });

    const document = await readRecruitmentCriteria(client, "g1");

    expect((document.data as { id: string }).id).toBe("c1");
  });

  it("POSTs a new criterion (no existing id) with the betaGroup relationship", async () => {
    const bodyOf = captureWrite("POST", "/v1/betaRecruitmentCriteria", 201, {
      data: { type: "betaRecruitmentCriteria", id: "c-new", attributes: {} },
      links: {
        self: `${ASC_API_BASE_URL}/v1/betaRecruitmentCriteria/c-new`,
      },
    });

    await setRecruitmentCriteria(client, "g1", [
      { deviceFamily: "IPHONE", minimumOsInclusive: "15.0" },
    ]);

    expect(JSON.parse(bodyOf() ?? "{}")).toEqual({
      data: {
        type: "betaRecruitmentCriteria",
        attributes: {
          deviceFamilyOsVersionFilters: [
            { deviceFamily: "IPHONE", minimumOsInclusive: "15.0" },
          ],
        },
        relationships: {
          betaGroup: { data: { type: "betaGroups", id: "g1" } },
        },
      },
    });
  });

  it("PATCHes the existing criterion by id (no relationship in the body)", async () => {
    const bodyOf = captureWrite(
      "PATCH",
      "/v1/betaRecruitmentCriteria/c1",
      200,
      {
        data: { type: "betaRecruitmentCriteria", id: "c1", attributes: {} },
        links: { self: `${ASC_API_BASE_URL}/v1/betaRecruitmentCriteria/c1` },
      },
    );

    await setRecruitmentCriteria(
      client,
      "g1",
      [{ deviceFamily: "IPAD" }],
      "c1",
    );

    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: { id: string; relationships?: unknown };
    };
    expect(body.data.id).toBe("c1");
    expect(body.data).not.toHaveProperty("relationships");
  });

  it("clears the criterion via DELETE on its id", async () => {
    let seen = false;
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/betaRecruitmentCriteria/c1", method: "DELETE" })
      .reply(() => {
        seen = true;
        return { statusCode: 204, data: "" };
      });

    await clearRecruitmentCriteria(client, "c1");

    expect(seen).toBe(true);
  });

  it("lists the legal options matrix", async () => {
    captureGet(
      "/v1/betaRecruitmentCriterionOptions",
      listBody([
        {
          type: "betaRecruitmentCriterionOptions",
          id: "opt-1",
          attributes: {},
        },
      ]),
    );

    const read = await listRecruitmentCriterionOptions(client, {
      scope: "single-page",
    });

    expect(read.items.map((o) => o.id)).toEqual(["opt-1"]);
  });

  it("reads the compatible-build preflight", async () => {
    captureGet(
      "/v1/betaGroups/g1/betaRecruitmentCriterionCompatibleBuildCheck",
      {
        data: {
          type: "betaRecruitmentCriterionCompatibleBuildChecks",
          id: "g1",
          attributes: { hasCompatibleBuild: true },
        },
        links: { self: `${ASC_API_BASE_URL}/v1/x` },
      },
    );

    const document = await checkRecruitmentCompatibleBuild(client, "g1");

    expect(document.data.attributes?.hasCompatibleBuild).toBe(true);
  });
});
