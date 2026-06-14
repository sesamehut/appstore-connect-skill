import { beforeAll, describe, expect, it } from "vitest";

import {
  createAppStoreVersionReleaseRequest,
  getAppStoreVersion,
  getVersionBuild,
  getVersionPhasedRelease,
  getVersionReviewSubmission,
  updateAppStoreVersionRelease,
} from "../src/capabilities/app-store-versions-release.js";
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
  method: "POST" | "PATCH",
  path: string,
  status: number,
  data: object | string,
): () => string | undefined {
  let body: string | undefined;
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({ path, method })
    .reply((request) => {
      body = request.body as string | undefined;
      return {
        statusCode: status,
        data,
        responseOptions: { headers: JSON_HEADERS },
      };
    });
  return () => body;
}

function versionDoc(id: string) {
  return {
    data: { type: "appStoreVersions", id },
    links: { self: `${ASC_API_BASE_URL}/v1/appStoreVersions/${id}` },
  };
}

describe("getAppStoreVersion", () => {
  it("reads one version by id passing include for aggregation", async () => {
    const pathOf = captureGet("/v1/appStoreVersions/v1", versionDoc("v1"));

    const document = await getAppStoreVersion(client, "v1", {
      include: ["build", "appStoreVersionPhasedRelease"],
    });

    expect(document.data.id).toBe("v1");
    const query = new URLSearchParams(pathOf().split("?")[1] ?? "");
    expect(query.get("include")).toBe("build,appStoreVersionPhasedRelease");
  });
});

describe("updateAppStoreVersionRelease", () => {
  it("PATCHes releaseType / earliestReleaseDate / downloadable + build relationship", async () => {
    const bodyOf = captureWrite(
      "PATCH",
      "/v1/appStoreVersions/v1",
      200,
      versionDoc("v1"),
    );

    await updateAppStoreVersionRelease(client, "v1", {
      releaseType: "SCHEDULED",
      earliestReleaseDate: "2026-09-01T10:00:00Z",
      downloadable: true,
      buildId: "b9",
    });

    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: {
        type: string;
        id: string;
        attributes: {
          releaseType: string;
          earliestReleaseDate: string;
          downloadable: boolean;
        };
        relationships: { build: { data: { type: string; id: string } } };
      };
    };
    expect(body.data.type).toBe("appStoreVersions");
    expect(body.data.id).toBe("v1");
    expect(body.data.attributes.releaseType).toBe("SCHEDULED");
    expect(body.data.attributes.earliestReleaseDate).toBe(
      "2026-09-01T10:00:00Z",
    );
    expect(body.data.attributes.downloadable).toBe(true);
    expect(body.data.relationships.build.data).toEqual({
      type: "builds",
      id: "b9",
    });
  });

  it("omits the build relationship block when no buildId is given", async () => {
    const bodyOf = captureWrite(
      "PATCH",
      "/v1/appStoreVersions/v1",
      200,
      versionDoc("v1"),
    );

    await updateAppStoreVersionRelease(client, "v1", { releaseType: "MANUAL" });

    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: { attributes: { releaseType: string }; relationships?: unknown };
    };
    expect(body.data.attributes.releaseType).toBe("MANUAL");
    expect(body.data.relationships).toBeUndefined();
  });
});

describe("createAppStoreVersionReleaseRequest", () => {
  it("POSTs the appStoreVersion relationship (async-accept; resource has no attributes)", async () => {
    const bodyOf = captureWrite(
      "POST",
      "/v1/appStoreVersionReleaseRequests",
      201,
      {
        data: { type: "appStoreVersionReleaseRequests", id: "rel-1" },
        links: {
          self: `${ASC_API_BASE_URL}/v1/appStoreVersionReleaseRequests/rel-1`,
        },
      },
    );

    const document = await createAppStoreVersionReleaseRequest(client, "v1");

    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: {
        type: string;
        attributes?: unknown;
        relationships: {
          appStoreVersion: { data: { type: string; id: string } };
        };
      };
    };
    expect(body.data.type).toBe("appStoreVersionReleaseRequests");
    expect(body.data.attributes).toBeUndefined();
    expect(body.data.relationships.appStoreVersion.data).toEqual({
      type: "appStoreVersions",
      id: "v1",
    });
    // Treated as async-accept: the caller takes the created id, not a state.
    expect(document.data.id).toBe("rel-1");
  });
});

describe("version-side to-one reads", () => {
  it("getVersionBuild reads the attached build via the version path", async () => {
    const pathOf = captureGet("/v1/appStoreVersions/v1/build", {
      data: { type: "builds", id: "b9" },
      links: { self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1/build` },
    });

    await getVersionBuild(client, "v1");

    expect(pathOf().startsWith("/v1/appStoreVersions/v1/build")).toBe(true);
  });

  it("getVersionPhasedRelease reads the phased-release via the version path", async () => {
    const pathOf = captureGet(
      "/v1/appStoreVersions/v1/appStoreVersionPhasedRelease",
      {
        data: { type: "appStoreVersionPhasedReleases", id: "ph-1" },
        links: {
          self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1/appStoreVersionPhasedRelease`,
        },
      },
    );

    await getVersionPhasedRelease(client, "v1");

    expect(
      pathOf().startsWith(
        "/v1/appStoreVersions/v1/appStoreVersionPhasedRelease",
      ),
    ).toBe(true);
  });

  it("getVersionReviewSubmission reads the deprecated legacy to-one (read-only)", async () => {
    const pathOf = captureGet(
      "/v1/appStoreVersions/v1/appStoreVersionSubmission",
      {
        data: { type: "appStoreVersionSubmissions", id: "legacy-1" },
        links: {
          self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1/appStoreVersionSubmission`,
        },
      },
    );

    // The read targets the deprecated legacy resource by design (read-only
    // status surface); the helper is intrinsically @deprecated in the contract.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    await getVersionReviewSubmission(client, "v1");

    expect(
      pathOf().startsWith("/v1/appStoreVersions/v1/appStoreVersionSubmission"),
    ).toBe(true);
  });
});
