import { beforeAll, describe, expect, it } from "vitest";

import {
  getBetaAppReviewDetail,
  getBetaAppReviewSubmission,
  getBuildBetaAppReviewSubmission,
  listBetaAppReviewSubmissions,
  submitBuildForBetaReview,
  updateBetaAppReviewDetail,
} from "../src/capabilities/beta-review.js";
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

describe("getBetaAppReviewDetail", () => {
  it("REQUIRES filter[app] and resolves the per-app singleton", async () => {
    const pathOf = captureGet(
      "/v1/betaAppReviewDetails",
      listBody([
        {
          type: "betaAppReviewDetails",
          id: "det-1",
          attributes: { contactEmail: "a@x.com" },
        },
      ]),
    );

    const detail = await getBetaAppReviewDetail(client, { appId: "app-1" });

    const query = new URLSearchParams(pathOf().split("?")[1] ?? "");
    // The signature forces filter[app]; the collection 400s without it.
    expect(query.get("filter[app]")).toBe("app-1");
    expect(detail.id).toBe("det-1");
  });

  it("throws not-found when the app has no review detail yet", async () => {
    captureGet("/v1/betaAppReviewDetails", listBody([]));

    const error = await thrownBy(
      getBetaAppReviewDetail(client, { appId: "app-1" }),
    );

    expect(error).toBeInstanceOf(AscNotFoundError);
    expect(error.message).toContain("app-1");
  });
});

describe("updateBetaAppReviewDetail", () => {
  it("PATCHes contact + demo fields keyed by the detail id", async () => {
    let capturedBody = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/betaAppReviewDetails/det-1", method: "PATCH" })
      .reply((request) => {
        capturedBody = request.body as string;
        return {
          statusCode: 200,
          data: {
            data: { type: "betaAppReviewDetails", id: "det-1" },
            links: {
              self: `${ASC_API_BASE_URL}/v1/betaAppReviewDetails/det-1`,
            },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    await updateBetaAppReviewDetail(client, "det-1", {
      contactEmail: "a@x.com",
      demoAccountRequired: false,
    });

    expect(JSON.parse(capturedBody)).toEqual({
      data: {
        type: "betaAppReviewDetails",
        id: "det-1",
        attributes: { contactEmail: "a@x.com", demoAccountRequired: false },
      },
    });
  });
});

describe("listBetaAppReviewSubmissions", () => {
  it("REQUIRES filter[build] and maps betaReviewState filter", async () => {
    const pathOf = captureGet(
      "/v1/betaAppReviewSubmissions",
      listBody([{ type: "betaAppReviewSubmissions", id: "sub-1" }]),
    );

    const read = await listBetaAppReviewSubmissions(client, {
      buildId: "b1",
      scope: "single-page",
      betaReviewState: ["WAITING_FOR_REVIEW"],
    });

    const query = new URLSearchParams(pathOf().split("?")[1] ?? "");
    expect(query.get("filter[build]")).toBe("b1");
    expect(query.get("filter[betaReviewState]")).toBe("WAITING_FOR_REVIEW");
    expect(read.items.map((s) => s.id)).toEqual(["sub-1"]);
  });
});

describe("getBetaAppReviewSubmission / getBuildBetaAppReviewSubmission", () => {
  it("reads one submission by id", async () => {
    captureGet("/v1/betaAppReviewSubmissions/sub-1", {
      data: { type: "betaAppReviewSubmissions", id: "sub-1" },
      links: { self: `${ASC_API_BASE_URL}/v1/betaAppReviewSubmissions/sub-1` },
    });

    const document = await getBetaAppReviewSubmission(client, "sub-1");

    expect(document.data.id).toBe("sub-1");
  });

  it("reads a build's current submission via the build-side to-one path", async () => {
    const pathOf = captureGet("/v1/builds/b1/betaAppReviewSubmission", {
      data: { type: "betaAppReviewSubmissions", id: "sub-1" },
      links: {
        self: `${ASC_API_BASE_URL}/v1/builds/b1/betaAppReviewSubmission`,
      },
    });

    await getBuildBetaAppReviewSubmission(client, "b1");

    expect(pathOf().startsWith("/v1/builds/b1/betaAppReviewSubmission")).toBe(
      true,
    );
  });
});

describe("submitBuildForBetaReview", () => {
  it("POSTs a submission with only the build relationship (no attributes)", async () => {
    let capturedBody = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/betaAppReviewSubmissions", method: "POST" })
      .reply((request) => {
        capturedBody = request.body as string;
        return {
          statusCode: 201,
          data: {
            data: { type: "betaAppReviewSubmissions", id: "sub-new" },
            links: {
              self: `${ASC_API_BASE_URL}/v1/betaAppReviewSubmissions/sub-new`,
            },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    await submitBuildForBetaReview(client, "b1");

    expect(JSON.parse(capturedBody)).toEqual({
      data: {
        type: "betaAppReviewSubmissions",
        relationships: { build: { data: { type: "builds", id: "b1" } } },
      },
    });
  });
});
