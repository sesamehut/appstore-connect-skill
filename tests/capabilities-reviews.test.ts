import { beforeAll, describe, expect, it } from "vitest";

import {
  getCustomerReview,
  getCustomerReviewResponse,
  listCustomerReviewsForApp,
  listCustomerReviewsForVersion,
  setCustomerReviewResponse,
} from "../src/capabilities/customer-reviews.js";
import { AscInvalidParameterError, AscNotFoundError } from "../src/errors.js";
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

describe("listCustomerReviewsForApp", () => {
  it("maps filters, sort, and the exists flag onto the query surface", async () => {
    let capturedPath = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) => path.startsWith("/v1/apps/123/customerReviews"),
        method: "GET",
      })
      .reply((request) => {
        capturedPath = request.path;
        return {
          statusCode: 200,
          data: {
            data: [
              {
                type: "customerReviews",
                id: "r1",
                attributes: { rating: 1, title: "Bad" },
              },
            ],
            links: { self: `${ASC_API_BASE_URL}/v1/apps/123/customerReviews` },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const read = await listCustomerReviewsForApp(client, "123", {
      scope: "single-page",
      rating: ["1", "2"],
      territory: ["USA"],
      hasPublishedResponse: false,
      sort: ["-createdDate"],
      fields: ["rating", "title", "body"],
    });

    const query = new URLSearchParams(capturedPath.split("?")[1] ?? "");
    expect(query.get("filter[rating]")).toBe("1,2");
    expect(query.get("filter[territory]")).toBe("USA");
    // openapi-fetch stringifies the boolean; asserted so a serializer change
    // cannot regress silently against ASC's parser.
    expect(query.get("exists[publishedResponse]")).toBe("false");
    expect(query.get("sort")).toBe("-createdDate");
    expect(query.get("fields[customerReviews]")).toBe("rating,title,body");
    expect(read.items.map((review) => review.id)).toEqual(["r1"]);
  });

  it("follows the cursor across pages and reports progress", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) =>
          path.startsWith("/v1/apps/123/customerReviews") &&
          !path.includes("cursor"),
        method: "GET",
      })
      .reply(
        200,
        {
          data: [{ type: "customerReviews", id: "r1" }],
          links: {
            self: `${ASC_API_BASE_URL}/v1/apps/123/customerReviews`,
            next: `${ASC_API_BASE_URL}/v1/apps/123/customerReviews?cursor=p2`,
          },
          meta: { paging: { limit: 1, total: 2 } },
        },
        { headers: JSON_HEADERS },
      );
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: "/v1/apps/123/customerReviews?cursor=p2",
        method: "GET",
      })
      .reply(
        200,
        {
          data: [{ type: "customerReviews", id: "r2" }],
          links: { self: `${ASC_API_BASE_URL}/v1/apps/123/customerReviews` },
          meta: { paging: { limit: 1, total: 2 } },
        },
        { headers: JSON_HEADERS },
      );

    const read = await listCustomerReviewsForApp(client, "123", {
      scope: "all-pages",
    });

    expect(read.items.map((review) => review.id)).toEqual(["r1", "r2"]);
    expect(read.pagesRead).toBe(2);
    expect(read.total).toBe(2);
  });
});

describe("listCustomerReviewsForVersion", () => {
  it("reads under the version path with the shared query builder", async () => {
    let capturedPath = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) =>
          path.startsWith("/v1/appStoreVersions/v9/customerReviews"),
        method: "GET",
      })
      .reply((request) => {
        capturedPath = request.path;
        return {
          statusCode: 200,
          data: {
            data: [{ type: "customerReviews", id: "r1" }],
            links: {
              self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v9/customerReviews`,
            },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const read = await listCustomerReviewsForVersion(client, "v9", {
      scope: "single-page",
      rating: ["5"],
    });

    const query = new URLSearchParams(capturedPath.split("?")[1] ?? "");
    expect(query.get("filter[rating]")).toBe("5");
    expect(read.items.map((review) => review.id)).toEqual(["r1"]);
  });
});

describe("getCustomerReview", () => {
  it("maps include and the response field selection", async () => {
    let capturedPath = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) => path.startsWith("/v1/customerReviews/r1"),
        method: "GET",
      })
      .reply((request) => {
        capturedPath = request.path;
        return {
          statusCode: 200,
          data: {
            data: { type: "customerReviews", id: "r1" },
            included: [
              {
                type: "customerReviewResponses",
                id: "resp1",
                attributes: { responseBody: "Thanks!", state: "PUBLISHED" },
              },
            ],
            links: { self: `${ASC_API_BASE_URL}/v1/customerReviews/r1` },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const document = await getCustomerReview(client, "r1", {
      include: ["response"],
      responseFields: ["responseBody", "state"],
    });

    const query = new URLSearchParams(capturedPath.split("?")[1] ?? "");
    expect(query.get("include")).toBe("response");
    expect(query.get("fields[customerReviewResponses]")).toBe(
      "responseBody,state",
    );
    expect(document.included?.[0]?.id).toBe("resp1");
  });
});

describe("getCustomerReviewResponse", () => {
  it("reads the to-one response path", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/customerReviews/r1/response", method: "GET" })
      .reply(
        200,
        {
          data: {
            type: "customerReviewResponses",
            id: "resp1",
            attributes: { responseBody: "Thanks!", state: "PUBLISHED" },
          },
          links: { self: `${ASC_API_BASE_URL}/v1/customerReviews/r1/response` },
        },
        { headers: JSON_HEADERS },
      );

    const document = await getCustomerReviewResponse(client, "r1");

    expect(document.data.id).toBe("resp1");
    expect(document.data.attributes?.responseBody).toBe("Thanks!");
  });

  it("surfaces a 404 as not-found, undisguised", async () => {
    const item = ascItem({ code: "NOT_FOUND", status: "404" });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/customerReviews/r1/response", method: "GET" })
      .reply(404, { errors: [item] });

    const error = await thrownBy(getCustomerReviewResponse(client, "r1"));

    expect(error).toBeInstanceOf(AscNotFoundError);
    expect(error.category).toBe("not-found");
  });

  it("converts the live 'no response yet' shape (200, data null) to not-found", async () => {
    // Real ASC answers a review without a response with 200 and `data: null`
    // on this to-one endpoint (verified live 2026-06), not a 404.
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/customerReviews/r1/response", method: "GET" })
      .reply(
        200,
        {
          data: null,
          links: { self: `${ASC_API_BASE_URL}/v1/customerReviews/r1/response` },
        },
        { headers: JSON_HEADERS },
      );

    const error = await thrownBy(getCustomerReviewResponse(client, "r1"));

    expect(error).toBeInstanceOf(AscNotFoundError);
    expect(error.message).toContain("no developer response yet");
  });
});

describe("setCustomerReviewResponse", () => {
  it("builds the upsert body around the plain review id", async () => {
    let capturedBody = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/customerReviewResponses", method: "POST" })
      .reply((request) => {
        capturedBody = request.body as string;
        return {
          statusCode: 201,
          data: {
            data: {
              type: "customerReviewResponses",
              id: "resp1",
              attributes: { responseBody: "Thanks!", state: "PENDING_PUBLISH" },
            },
            links: {
              self: `${ASC_API_BASE_URL}/v1/customerReviewResponses/resp1`,
            },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const document = await setCustomerReviewResponse(client, "r1", "Thanks!");

    expect(JSON.parse(capturedBody)).toEqual({
      data: {
        type: "customerReviewResponses",
        attributes: { responseBody: "Thanks!" },
        relationships: {
          review: { data: { type: "customerReviews", id: "r1" } },
        },
      },
    });
    expect(document.data.attributes?.state).toBe("PENDING_PUBLISH");
  });

  it("surfaces a 422 with its source pointer as invalid-parameter", async () => {
    const item = ascItem({
      code: "ENTITY_ERROR.ATTRIBUTE.REQUIRED",
      status: "422",
      source: { pointer: "/data/attributes/responseBody" },
    });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/customerReviewResponses", method: "POST" })
      .reply(422, { errors: [item] }, { headers: JSON_HEADERS });

    const error = await thrownBy(setCustomerReviewResponse(client, "r1", ""));

    expect(error).toBeInstanceOf(AscInvalidParameterError);
    expect(error.apiErrors).toEqual([item]);
  });
});
