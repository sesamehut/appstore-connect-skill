import { beforeAll, describe, expect, it } from "vitest";

import {
  addIndividualTesters,
  assignBuildToBetaGroups,
  expireBuild,
  findLatestProcessedBuild,
  getBuild,
  getBuildBetaDetail,
  listBuildIndividualTesters,
  listBuilds,
  listPreReleaseVersionBuilds,
  listPreReleaseVersions,
  removeBuildFromBetaGroups,
  removeIndividualTesters,
  updateBuildBetaDetail,
} from "../src/capabilities/builds.js";
import { AscNotFoundError } from "../src/errors.js";
import { ASC_API_BASE_URL } from "../src/http/client.js";
import type { AscClient } from "../src/http/client.js";
import {
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

function build(id: string) {
  return { type: "builds" as const, id, attributes: { version: id } };
}

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

describe("listBuilds", () => {
  it("maps app/platform/processingState/expired/audience filters and sort", async () => {
    const pathOf = captureGet("/v1/builds", listBody([build("b1")]));

    const read = await listBuilds(client, {
      scope: "single-page",
      app: ["app-1"],
      platform: ["IOS"],
      processingState: ["VALID"],
      version: ["1234"],
      expired: ["false"],
      audienceType: ["APP_STORE_ELIGIBLE"],
      sort: ["-uploadedDate"],
    });

    const query = new URLSearchParams(pathOf().split("?")[1] ?? "");
    expect(query.get("filter[app]")).toBe("app-1");
    expect(query.get("filter[preReleaseVersion.platform]")).toBe("IOS");
    expect(query.get("filter[processingState]")).toBe("VALID");
    expect(query.get("filter[version]")).toBe("1234");
    expect(query.get("filter[expired]")).toBe("false");
    expect(query.get("filter[buildAudienceType]")).toBe("APP_STORE_ELIGIBLE");
    expect(query.get("sort")).toBe("-uploadedDate");
    expect(read.items.map((b) => b.id)).toEqual(["b1"]);
  });
});

describe("getBuild", () => {
  it("maps include onto a single-build read", async () => {
    const pathOf = captureGet("/v1/builds/b1", {
      data: build("b1"),
      links: { self: `${ASC_API_BASE_URL}/v1/builds/b1` },
    });

    await getBuild(client, "b1", { include: ["preReleaseVersion"] });

    const query = new URLSearchParams(pathOf().split("?")[1] ?? "");
    expect(query.get("include")).toBe("preReleaseVersion");
  });
});

describe("findLatestProcessedBuild", () => {
  it("filters VALID + sorts -uploadedDate + takes the first", async () => {
    const pathOf = captureGet(
      "/v1/builds",
      listBody([build("b-newest"), build("b-older")]),
    );

    const match = await findLatestProcessedBuild(client, {
      appId: "app-1",
      platform: "IOS",
      audienceType: "APP_STORE_ELIGIBLE",
    });

    const query = new URLSearchParams(pathOf().split("?")[1] ?? "");
    expect(query.get("filter[app]")).toBe("app-1");
    expect(query.get("filter[processingState]")).toBe("VALID");
    expect(query.get("sort")).toBe("-uploadedDate");
    expect(query.get("filter[preReleaseVersion.platform]")).toBe("IOS");
    expect(query.get("filter[buildAudienceType]")).toBe("APP_STORE_ELIGIBLE");
    // The maxItems:1 scope is enforced client-side; the first item wins
    // regardless of how many the page returns.
    expect(match.id).toBe("b-newest");
  });

  it("throws a helpful not-found when there is no processed build", async () => {
    captureGet("/v1/builds", listBody([]));

    const error = await thrownBy(
      findLatestProcessedBuild(client, { appId: "app-1", platform: "IOS" }),
    );

    expect(error).toBeInstanceOf(AscNotFoundError);
    expect(error.message).toContain("app-1");
    expect(error.message).toContain("IOS");
  });
});

describe("expireBuild", () => {
  it("PATCHes expired=true on the build id", async () => {
    const bodyOf = captureWrite("PATCH", "/v1/builds/b1", 200, {
      data: build("b1"),
      links: { self: `${ASC_API_BASE_URL}/v1/builds/b1` },
    });

    await expireBuild(client, "b1");

    expect(JSON.parse(bodyOf() ?? "{}")).toEqual({
      data: { type: "builds", id: "b1", attributes: { expired: true } },
    });
  });
});

describe("buildBetaDetail", () => {
  it("reads the build-side to-one detail", async () => {
    captureGet("/v1/builds/b1/buildBetaDetail", {
      data: {
        type: "buildBetaDetails",
        id: "d1",
        attributes: { autoNotifyEnabled: false },
      },
      links: { self: `${ASC_API_BASE_URL}/v1/builds/b1/buildBetaDetail` },
    });

    const document = await getBuildBetaDetail(client, "b1");

    expect(document.data.id).toBe("d1");
  });

  it("updates only autoNotifyEnabled, keyed by the detail id (not the build id)", async () => {
    const bodyOf = captureWrite("PATCH", "/v1/buildBetaDetails/d1", 200, {
      data: {
        type: "buildBetaDetails",
        id: "d1",
        attributes: { autoNotifyEnabled: true },
      },
      links: { self: `${ASC_API_BASE_URL}/v1/buildBetaDetails/d1` },
    });

    await updateBuildBetaDetail(client, "d1", { autoNotifyEnabled: true });

    expect(JSON.parse(bodyOf() ?? "{}")).toEqual({
      data: {
        type: "buildBetaDetails",
        id: "d1",
        attributes: { autoNotifyEnabled: true },
      },
    });
  });
});

describe("build distribution relationships", () => {
  it("assigns betaGroups via the build-side relationship POST", async () => {
    const bodyOf = captureWrite(
      "POST",
      "/v1/builds/b1/relationships/betaGroups",
      204,
      "",
    );

    await assignBuildToBetaGroups(client, "b1", ["g1", "g2"]);

    expect(JSON.parse(bodyOf() ?? "{}")).toEqual({
      data: [
        { type: "betaGroups", id: "g1" },
        { type: "betaGroups", id: "g2" },
      ],
    });
  });

  it("removes betaGroups via the build-side relationship DELETE", async () => {
    const bodyOf = captureWrite(
      "DELETE",
      "/v1/builds/b1/relationships/betaGroups",
      204,
      "",
    );

    await removeBuildFromBetaGroups(client, "b1", ["g1"]);

    expect(JSON.parse(bodyOf() ?? "{}")).toEqual({
      data: [{ type: "betaGroups", id: "g1" }],
    });
  });

  it("adds individual testers via the build-side relationship POST", async () => {
    const bodyOf = captureWrite(
      "POST",
      "/v1/builds/b1/relationships/individualTesters",
      204,
      "",
    );

    await addIndividualTesters(client, "b1", ["t1"]);

    expect(JSON.parse(bodyOf() ?? "{}")).toEqual({
      data: [{ type: "betaTesters", id: "t1" }],
    });
  });

  it("removes individual testers via the build-side relationship DELETE", async () => {
    const bodyOf = captureWrite(
      "DELETE",
      "/v1/builds/b1/relationships/individualTesters",
      204,
      "",
    );

    await removeIndividualTesters(client, "b1", ["t1", "t2"]);

    expect(JSON.parse(bodyOf() ?? "{}")).toEqual({
      data: [
        { type: "betaTesters", id: "t1" },
        { type: "betaTesters", id: "t2" },
      ],
    });
  });

  it("lists a build's individual testers under the build path", async () => {
    const pathOf = captureGet(
      "/v1/builds/b1/individualTesters",
      listBody([{ type: "betaTesters", id: "t1" }]),
    );

    const read = await listBuildIndividualTesters(client, "b1", {
      scope: "single-page",
    });

    expect(pathOf().startsWith("/v1/builds/b1/individualTesters")).toBe(true);
    expect(read.items.map((t) => t.id)).toEqual(["t1"]);
  });
});

describe("pre-release versions", () => {
  it("lists pre-release versions with app/platform/version filters", async () => {
    const pathOf = captureGet(
      "/v1/preReleaseVersions",
      listBody([{ type: "preReleaseVersions", id: "pre-1" }]),
    );

    await listPreReleaseVersions(client, {
      scope: "single-page",
      app: ["app-1"],
      platform: ["IOS"],
      version: ["1.2.0"],
    });

    const query = new URLSearchParams(pathOf().split("?")[1] ?? "");
    expect(query.get("filter[app]")).toBe("app-1");
    expect(query.get("filter[platform]")).toBe("IOS");
    expect(query.get("filter[version]")).toBe("1.2.0");
  });

  it("lists a pre-release version's builds under its path", async () => {
    const pathOf = captureGet(
      "/v1/preReleaseVersions/pre-1/builds",
      listBody([build("b1")]),
    );

    const read = await listPreReleaseVersionBuilds(client, "pre-1", {
      scope: "single-page",
    });

    expect(pathOf().startsWith("/v1/preReleaseVersions/pre-1/builds")).toBe(
      true,
    );
    expect(read.items.map((b) => b.id)).toEqual(["b1"]);
  });
});
