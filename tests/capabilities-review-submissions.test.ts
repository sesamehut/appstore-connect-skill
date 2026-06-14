import { beforeAll, describe, expect, it } from "vitest";

import {
  createReviewSubmission,
  createReviewSubmissionItem,
  deleteReviewSubmissionItem,
  getReviewSubmission,
  listReviewSubmissionItems,
  listReviewSubmissions,
  updateReviewSubmission,
  updateReviewSubmissionItem,
} from "../src/capabilities/review-submissions.js";
import { AscInvalidParameterError } from "../src/errors.js";
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

/** Intercepts a GET by prefix and captures the path the client actually sent. */
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

/** Intercepts a write by exact path and captures the JSON body. */
function captureWrite(
  method: "POST" | "PATCH" | "DELETE",
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

function listBody(items: readonly unknown[]) {
  return { data: items, links: { self: `${ASC_API_BASE_URL}/v1/list` } };
}

// ---------------------------------------------------------------------------
// reviewSubmissions (the modern container)
// ---------------------------------------------------------------------------

describe("listReviewSubmissions", () => {
  it("REQUIRES filter[app] and maps state/platform filters", async () => {
    const pathOf = captureGet(
      "/v1/reviewSubmissions",
      listBody([{ type: "reviewSubmissions", id: "sub-1" }]),
    );

    const read = await listReviewSubmissions(client, {
      appId: "app-1",
      scope: "single-page",
      state: ["READY_FOR_REVIEW"],
      platform: ["IOS"],
    });

    const query = new URLSearchParams(pathOf().split("?")[1] ?? "");
    // filter[app] is non-optional in the contract; the collection 400s without it.
    expect(query.get("filter[app]")).toBe("app-1");
    expect(query.get("filter[state]")).toBe("READY_FOR_REVIEW");
    expect(query.get("filter[platform]")).toBe("IOS");
    expect(read.items.map((s) => s.id)).toEqual(["sub-1"]);
  });

  it("hits the top-level /v1/reviewSubmissions collection path", async () => {
    const pathOf = captureGet(
      "/v1/reviewSubmissions",
      listBody([{ type: "reviewSubmissions", id: "sub-1" }]),
    );

    await listReviewSubmissions(client, {
      appId: "app-1",
      scope: "single-page",
    });

    expect(pathOf().startsWith("/v1/reviewSubmissions?")).toBe(true);
  });
});

describe("getReviewSubmission", () => {
  it("reads one submission by id with include/fields query", async () => {
    const pathOf = captureGet("/v1/reviewSubmissions/sub-1", {
      data: { type: "reviewSubmissions", id: "sub-1" },
      links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissions/sub-1` },
    });

    const document = await getReviewSubmission(client, "sub-1", {
      include: ["items"],
    });

    expect(document.data.id).toBe("sub-1");
    const query = new URLSearchParams(pathOf().split("?")[1] ?? "");
    expect(query.get("include")).toBe("items");
  });
});

describe("createReviewSubmission", () => {
  it("POSTs the app relationship with the reviewSubmissions JSON:API type", async () => {
    const bodyOf = captureWrite("POST", "/v1/reviewSubmissions", 201, {
      data: { type: "reviewSubmissions", id: "sub-new" },
      links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissions/sub-new` },
    });

    await createReviewSubmission(client, "app-1");

    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: {
        type: string;
        relationships: { app: { data: { type: string; id: string } } };
        attributes?: unknown;
      };
    };
    expect(body.data.type).toBe("reviewSubmissions");
    expect(body.data.relationships.app.data).toEqual({
      type: "apps",
      id: "app-1",
    });
    // No platform was passed, so the create carries no attributes block.
    expect(body.data.attributes).toBeUndefined();
  });

  it("carries the platform attribute when supplied", async () => {
    const bodyOf = captureWrite("POST", "/v1/reviewSubmissions", 201, {
      data: { type: "reviewSubmissions", id: "sub-new" },
      links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissions/sub-new` },
    });

    await createReviewSubmission(client, "app-1", "IOS");

    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: { attributes: { platform: string } };
    };
    expect(body.data.attributes.platform).toBe("IOS");
  });
});

describe("updateReviewSubmission", () => {
  it("PATCHes submitted=true and NEVER writes the read-only state", async () => {
    const bodyOf = captureWrite("PATCH", "/v1/reviewSubmissions/sub-1", 200, {
      data: { type: "reviewSubmissions", id: "sub-1" },
      links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissions/sub-1` },
    });

    await updateReviewSubmission(client, "sub-1", { submitted: true });

    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: { type: string; id: string; attributes: Record<string, unknown> };
    };
    expect(body.data).toEqual({
      type: "reviewSubmissions",
      id: "sub-1",
      attributes: { submitted: true },
    });
    expect(body.data.attributes.state).toBeUndefined();
  });

  it("PATCHes canceled=true for the withdraw path", async () => {
    const bodyOf = captureWrite("PATCH", "/v1/reviewSubmissions/sub-1", 200, {
      data: { type: "reviewSubmissions", id: "sub-1" },
      links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissions/sub-1` },
    });

    await updateReviewSubmission(client, "sub-1", { canceled: true });

    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: { attributes: { canceled: boolean } };
    };
    expect(body.data.attributes.canceled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// reviewSubmissionItems (the attached content)
// ---------------------------------------------------------------------------

describe("createReviewSubmissionItem", () => {
  it("POSTs reviewSubmission + exactly one appStoreVersion content relationship", async () => {
    const bodyOf = captureWrite("POST", "/v1/reviewSubmissionItems", 201, {
      data: { type: "reviewSubmissionItems", id: "item-1" },
      links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissionItems/item-1` },
    });

    await createReviewSubmissionItem(client, "sub-1", {
      appStoreVersion: "v1",
    });

    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: {
        type: string;
        relationships: {
          reviewSubmission?: { data: { type: string; id: string } };
          appStoreVersion?: { data: { type: string; id: string } };
        };
      };
    };
    expect(body.data.type).toBe("reviewSubmissionItems");
    expect(body.data.relationships.reviewSubmission?.data).toEqual({
      type: "reviewSubmissions",
      id: "sub-1",
    });
    expect(body.data.relationships.appStoreVersion?.data).toEqual({
      type: "appStoreVersions",
      id: "v1",
    });
    // Only the version + the parent — no stray content relationships leaked in.
    expect(Object.keys(body.data.relationships).sort()).toEqual([
      "appStoreVersion",
      "reviewSubmission",
    ]);
  });

  it("rejects ZERO content relationships locally with NO network call", async () => {
    // No interceptor registered: a network hit would fail the disabled
    // connect, so reaching the wire is itself a defect. The guard must throw
    // before any POST.
    const error = await thrownBy(
      createReviewSubmissionItem(client, "sub-1", {}),
    );

    expect(error).toBeInstanceOf(AscInvalidParameterError);
    expect(error.message).toContain("exactly one content relationship");
  });
});

describe("updateReviewSubmissionItem", () => {
  it("PATCHes removed/resolved booleans by item id (not the read-only state)", async () => {
    const bodyOf = captureWrite(
      "PATCH",
      "/v1/reviewSubmissionItems/item-1",
      200,
      {
        data: { type: "reviewSubmissionItems", id: "item-1" },
        links: {
          self: `${ASC_API_BASE_URL}/v1/reviewSubmissionItems/item-1`,
        },
      },
    );

    await updateReviewSubmissionItem(client, "item-1", {
      removed: true,
      resolved: true,
    });

    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: { type: string; id: string; attributes: Record<string, unknown> };
    };
    expect(body.data).toEqual({
      type: "reviewSubmissionItems",
      id: "item-1",
      attributes: { removed: true, resolved: true },
    });
    expect(body.data.attributes.state).toBeUndefined();
  });
});

describe("deleteReviewSubmissionItem", () => {
  it("DELETEs the item by id", async () => {
    let hit = false;
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/reviewSubmissionItems/item-1", method: "DELETE" })
      .reply(() => {
        hit = true;
        return { statusCode: 204, data: "" };
      });

    await deleteReviewSubmissionItem(client, "item-1");

    expect(hit).toBe(true);
  });
});

describe("listReviewSubmissionItems", () => {
  it("reads items via the parent to-many related endpoint", async () => {
    const pathOf = captureGet(
      "/v1/reviewSubmissions/sub-1/items",
      listBody([{ type: "reviewSubmissionItems", id: "item-1" }]),
    );

    const read = await listReviewSubmissionItems(client, "sub-1", {
      scope: "single-page",
    });

    expect(pathOf().startsWith("/v1/reviewSubmissions/sub-1/items")).toBe(true);
    expect(read.items.map((i) => i.id)).toEqual(["item-1"]);
  });
});
