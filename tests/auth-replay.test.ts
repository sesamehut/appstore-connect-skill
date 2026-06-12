import { jwtVerify } from "jose";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadAscCredentialsFromEnv } from "../src/auth/credentials.js";
import type { AscCredentials } from "../src/auth/credentials.js";
import { AscTokenProvider, signAscToken } from "../src/auth/token.js";
import { AscAuthenticationError } from "../src/errors.js";
import type { AscApiErrorItem } from "../src/errors.js";
import { ASC_API_BASE_URL, createAscClient } from "../src/http/client.js";
import type { AscClient } from "../src/http/client.js";
import { headerValue, useMockAgent } from "./helpers/mock-agent.js";
import { makeTestKey } from "./helpers/test-credentials.js";
import type { TestKeyMaterial } from "./helpers/test-credentials.js";

const NOT_AUTHORIZED: AscApiErrorItem = {
  code: "NOT_AUTHORIZED",
  status: "401",
  title: "Authentication credentials are missing or invalid.",
  detail:
    "Provide a properly configured and signed bearer token, and make sure that it has not expired.",
};

const getAgent = useMockAgent();

let key: TestKeyMaterial;
let credentials: AscCredentials;
let signings: () => number;
let client: AscClient;

beforeAll(async () => {
  key = await makeTestKey();
  credentials = await loadAscCredentialsFromEnv(key.envTeam);
});

beforeEach(() => {
  let count = 0;
  const tokenProvider = new AscTokenProvider(credentials, {
    sign: (creds, nowMs) => {
      count += 1;
      return signAscToken(creds, nowMs);
    },
  });
  signings = () => count;
  client = createAscClient({ credentials, tokenProvider });
});

function bearerOf(headers: unknown): string {
  return (headerValue(headers, "authorization") ?? "").slice("Bearer ".length);
}

describe("401 re-sign and replay", () => {
  it("re-signs once, replays with the fresh token, and succeeds", async () => {
    const tokens: string[] = [];
    const origin = getAgent().get(ASC_API_BASE_URL);
    origin.intercept({ path: "/v1/apps", method: "GET" }).reply((options) => {
      tokens.push(bearerOf(options.headers));
      return { statusCode: 401, data: { errors: [NOT_AUTHORIZED] } };
    });
    origin.intercept({ path: "/v1/apps", method: "GET" }).reply((options) => {
      tokens.push(bearerOf(options.headers));
      return {
        statusCode: 200,
        data: { data: [], links: { self: `${ASC_API_BASE_URL}/v1/apps` } },
      };
    });

    const { data, response } = await client.GET("/v1/apps");

    expect(response.status).toBe(200);
    expect(data).toBeDefined();
    expect(tokens).toHaveLength(2);
    expect(tokens[1]).not.toBe(tokens[0]);
    // The replayed token is a genuine fresh signature, not a mutation.
    await jwtVerify(tokens[1] ?? "", key.publicKey);
    expect(signings()).toBe(2);
  });

  it("gives up after the second 401 with an authentication error", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps", method: "GET" })
      .reply(401, { errors: [NOT_AUTHORIZED] })
      .times(2);

    const thrown = await client.GET("/v1/apps").then(
      () => expect.fail("expected an authentication error"),
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(AscAuthenticationError);
    const authError = thrown as AscAuthenticationError;
    expect(authError.message).toContain("re-sign");
    expect(authError.message).toContain("team key");
    expect(authError.apiErrors).toEqual([NOT_AUTHORIZED]);
    expect(signings()).toBe(2);
  });

  it("merges concurrent 401 storms into a single re-sign", async () => {
    let staleToken: string | undefined;
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps", method: "GET" })
      .reply((options) => {
        const token = bearerOf(options.headers);
        staleToken ??= token;
        const rejected = token === staleToken;
        const data: object = rejected
          ? { errors: [NOT_AUTHORIZED] }
          : { data: [], links: { self: `${ASC_API_BASE_URL}/v1/apps` } };
        return { statusCode: rejected ? 401 : 200, data };
      })
      .times(4);

    const [first, second] = await Promise.all([
      client.GET("/v1/apps"),
      client.GET("/v1/apps"),
    ]);

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    // One shared initial signing plus one shared forced re-sign.
    expect(signings()).toBe(2);
  });
});
