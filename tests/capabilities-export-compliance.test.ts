import { beforeAll, describe, expect, it } from "vitest";

import { setBuildExportCompliance } from "../src/capabilities/export-compliance.js";
import { ASC_API_BASE_URL } from "../src/http/client.js";
import type { AscClient } from "../src/http/client.js";
import { JSON_HEADERS, makeOfflineClient } from "./helpers/asc-fixtures.js";
import { useMockAgent } from "./helpers/mock-agent.js";

const getAgent = useMockAgent();

let client: AscClient;

beforeAll(async () => {
  client = await makeOfflineClient();
});

function captureBuildPatch(): () => string | undefined {
  let body: string | undefined;
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({ path: "/v1/builds/b1", method: "PATCH" })
    .reply((request) => {
      body = request.body as string | undefined;
      return {
        statusCode: 200,
        data: {
          data: { type: "builds", id: "b1" },
          links: { self: `${ASC_API_BASE_URL}/v1/builds/b1` },
        },
        responseOptions: { headers: JSON_HEADERS },
      };
    });
  return () => body;
}

describe("setBuildExportCompliance", () => {
  it("PATCHes usesNonExemptEncryption=false on the build (the only field)", async () => {
    const bodyOf = captureBuildPatch();

    await setBuildExportCompliance(client, "b1", false);

    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: { type: string; id: string; attributes: Record<string, unknown> };
    };
    // The encryption flag lives on Build, not the version; there is no
    // exportComplianceUsesEncryption field in the contract.
    expect(body.data).toEqual({
      type: "builds",
      id: "b1",
      attributes: { usesNonExemptEncryption: false },
    });
  });

  it("PATCHes usesNonExemptEncryption=true as a plain boolean", async () => {
    const bodyOf = captureBuildPatch();

    await setBuildExportCompliance(client, "b1", true);

    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: { attributes: { usesNonExemptEncryption: boolean } };
    };
    expect(body.data.attributes.usesNonExemptEncryption).toBe(true);
  });
});
