import { beforeAll, describe, expect, it } from "vitest";

import {
  createAppStoreReviewDetail,
  findAppStoreReviewDetail,
  getAppStoreReviewDetail,
  updateAppStoreReviewDetail,
} from "../src/capabilities/app-store-review-details.js";
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

function ascGet(prefix: string, data: object | string): void {
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({ path: (path) => path.startsWith(prefix), method: "GET" })
    .reply(200, data, { headers: JSON_HEADERS });
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

// The to-one related read returns { data: null } when no detail exists yet.
function reviewDetailRead(detail: object | null) {
  return {
    data: detail,
    links: {
      self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1/appStoreReviewDetail`,
    },
  };
}

describe("findAppStoreReviewDetail", () => {
  it("returns the detail via the version-side to-one read", async () => {
    ascGet(
      "/v1/appStoreVersions/v1/appStoreReviewDetail",
      reviewDetailRead({
        type: "appStoreReviewDetails",
        id: "rd-1",
        attributes: { contactEmail: "a@x.com" },
      }),
    );

    const detail = await findAppStoreReviewDetail(client, "v1");

    expect(detail?.id).toBe("rd-1");
  });

  it("narrows an absent detail (data: null) to undefined", async () => {
    ascGet(
      "/v1/appStoreVersions/v1/appStoreReviewDetail",
      reviewDetailRead(null),
    );

    const detail = await findAppStoreReviewDetail(client, "v1");

    expect(detail).toBeUndefined();
  });
});

describe("getAppStoreReviewDetail", () => {
  it("throws not-found when the version has no detail", async () => {
    ascGet(
      "/v1/appStoreVersions/v1/appStoreReviewDetail",
      reviewDetailRead(null),
    );

    const error = await thrownBy(getAppStoreReviewDetail(client, "v1"));

    expect(error).toBeInstanceOf(AscNotFoundError);
    expect(error.message).toContain("v1");
  });
});

describe("appStoreReviewDetail find-or-create (per version)", () => {
  it("first-read 404/absent -> POST carrying the appStoreVersion relationship", async () => {
    const bodyOf = captureWrite("POST", "/v1/appStoreReviewDetails", 201, {
      data: { type: "appStoreReviewDetails", id: "rd-new" },
      links: { self: `${ASC_API_BASE_URL}/v1/appStoreReviewDetails/rd-new` },
    });

    await createAppStoreReviewDetail(client, "v1", { notes: "see demo" });

    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: {
        type: string;
        attributes: { notes: string };
        relationships: {
          appStoreVersion: { data: { type: string; id: string } };
        };
      };
    };
    expect(body.data.type).toBe("appStoreReviewDetails");
    expect(body.data.attributes.notes).toBe("see demo");
    expect(body.data.relationships.appStoreVersion.data).toEqual({
      type: "appStoreVersions",
      id: "v1",
    });
  });

  it("existing detail -> PATCH by the detail id (NOT the version id)", async () => {
    const bodyOf = captureWrite(
      "PATCH",
      "/v1/appStoreReviewDetails/rd-1",
      200,
      {
        data: { type: "appStoreReviewDetails", id: "rd-1" },
        links: { self: `${ASC_API_BASE_URL}/v1/appStoreReviewDetails/rd-1` },
      },
    );

    await updateAppStoreReviewDetail(client, "rd-1", {
      contactEmail: "new@x.com",
    });

    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: {
        type: string;
        id: string;
        attributes: { contactEmail: string };
        relationships?: unknown;
      };
    };
    // PATCH is keyed by the detail id and carries no relationship block: the
    // version link is fixed at create and never re-sent on update.
    expect(body.data.id).toBe("rd-1");
    expect(body.data.attributes.contactEmail).toBe("new@x.com");
    expect(body.data.relationships).toBeUndefined();
  });
});
