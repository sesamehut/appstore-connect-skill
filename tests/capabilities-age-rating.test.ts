import { beforeAll, describe, expect, it } from "vitest";

import { getAgeRatingDeclaration } from "../src/capabilities/age-rating.js";
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

/**
 * Intercepts the appInfos collection read and captures its path. Any non-GET
 * method (a PATCH) would have no interceptor and fail the disabled connect —
 * so the read-only guarantee is enforced by the agent, not just by inspection.
 */
function captureAppInfos(data: object): () => string {
  let capturedPath = "";
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({
      path: (path) => path.startsWith("/v1/apps/app-1/appInfos"),
      method: "GET",
    })
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

describe("getAgeRatingDeclaration", () => {
  it("resolves the declaration from appInfos include=ageRatingDeclaration (read-only)", async () => {
    const pathOf = captureAppInfos({
      data: [{ type: "appInfos", id: "ai-1" }],
      included: [
        {
          type: "ageRatingDeclarations",
          id: "ar-1",
          attributes: { ageRatingOverrideV2: "NONE" },
        },
      ],
      links: { self: `${ASC_API_BASE_URL}/v1/apps/app-1/appInfos` },
    });

    const declaration = await getAgeRatingDeclaration(client, "app-1");

    // App-info scoped (not version scoped) and read through the include.
    expect(declaration.id).toBe("ar-1");
    const query = new URLSearchParams(pathOf().split("?")[1] ?? "");
    expect(query.get("include")).toBe("ageRatingDeclaration");
  });

  it("throws not-found when no declaration is included", async () => {
    captureAppInfos({
      data: [{ type: "appInfos", id: "ai-1" }],
      included: [],
      links: { self: `${ASC_API_BASE_URL}/v1/apps/app-1/appInfos` },
    });

    const error = await thrownBy(getAgeRatingDeclaration(client, "app-1"));

    expect(error).toBeInstanceOf(AscNotFoundError);
    expect(error.message).toContain("app-1");
  });
});
