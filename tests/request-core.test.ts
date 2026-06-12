import { decodeProtectedHeader, jwtVerify } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { loadAscCredentialsFromEnv } from "../src/auth/credentials.js";
import type { AscCredentials } from "../src/auth/credentials.js";
import { ASC_TOKEN_AUDIENCE } from "../src/auth/token.js";
import { ASC_API_BASE_URL, createAscClient } from "../src/http/client.js";
import { headerValue, useMockAgent } from "./helpers/mock-agent.js";
import {
  makeTestKey,
  TEST_ISSUER_ID,
  TEST_KEY_ID,
} from "./helpers/test-credentials.js";
import type { TestKeyMaterial } from "./helpers/test-credentials.js";

const getAgent = useMockAgent();

let key: TestKeyMaterial;
let credentials: AscCredentials;

beforeAll(async () => {
  key = await makeTestKey();
  credentials = await loadAscCredentialsFromEnv(key.envTeam);
});

describe("request core happy path", () => {
  it("performs a typed read with a verifiable signed bearer token", async () => {
    let capturedAuth: string | undefined;
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: (path) => path.startsWith("/v1/apps"), method: "GET" })
      .reply((options) => {
        capturedAuth = headerValue(options.headers, "authorization");
        return {
          statusCode: 200,
          data: {
            data: [{ type: "apps", id: "1571800372" }],
            links: { self: `${ASC_API_BASE_URL}/v1/apps` },
          },
          responseOptions: {
            headers: { "content-type": "application/json" },
          },
        };
      });

    const client = createAscClient({ credentials });
    const { data, response } = await client.GET("/v1/apps", {
      params: { query: { limit: 1 } },
    });

    expect(response.status).toBe(200);
    expect(data?.data[0]?.id).toBe("1571800372");

    // Verifying the captured token against the runtime-generated public key
    // proves the whole signing chain end to end, not just header shapes.
    expect(capturedAuth).toMatch(/^Bearer /);
    const token = (capturedAuth ?? "").slice("Bearer ".length);
    expect(decodeProtectedHeader(token)).toEqual({
      alg: "ES256",
      kid: TEST_KEY_ID,
      typ: "JWT",
    });
    const { payload } = await jwtVerify(token, key.publicKey, {
      audience: ASC_TOKEN_AUDIENCE,
      issuer: TEST_ISSUER_ID,
    });
    expect(payload.exp).toBeDefined();
  });
});

describe("query serialization", () => {
  it("serializes JSON:API list params comma-joined, not exploded", async () => {
    let capturedPath = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: (path) => path.startsWith("/v1/apps"), method: "GET" })
      .reply((options) => {
        capturedPath = options.path;
        return {
          statusCode: 200,
          data: { data: [], links: { self: `${ASC_API_BASE_URL}/v1/apps` } },
        };
      });

    const client = createAscClient({ credentials });
    await client.GET("/v1/apps", {
      params: {
        query: {
          limit: 2,
          "fields[apps]": ["name", "bundleId"],
          "filter[bundleId]": ["com.example.one", "com.example.two"],
        },
      },
    });

    expect(capturedPath).toContain("fields[apps]=name,bundleId");
    expect(capturedPath).toContain(
      "filter[bundleId]=com.example.one,com.example.two",
    );

    const query = new URLSearchParams(capturedPath.split("?")[1] ?? "");
    expect(query.getAll("fields[apps]")).toEqual(["name,bundleId"]);
    expect(query.getAll("filter[bundleId]")).toEqual([
      "com.example.one,com.example.two",
    ]);
    expect(query.get("limit")).toBe("2");
  });
});
