import { beforeAll, describe, expect, it } from "vitest";

import { loadAscCredentialsFromEnv } from "../src/auth/credentials.js";
import type { AscCredentials } from "../src/auth/credentials.js";
import {
  AscAuthenticationError,
  AscCredentialError,
  AscError,
  AscInvalidParameterError,
  AscNetworkError,
  AscNotFoundError,
  AscPermissionError,
  AscRateLimitError,
  AscUpstreamError,
} from "../src/errors.js";
import type { AscApiErrorItem } from "../src/errors.js";
import { ASC_API_BASE_URL, createAscClient } from "../src/http/client.js";
import type { AscClient } from "../src/http/client.js";
import { useMockAgent } from "./helpers/mock-agent.js";
import { makeTestKey } from "./helpers/test-credentials.js";

const getAgent = useMockAgent();

let teamClient: AscClient;
let individualClient: AscClient;
let credentials: AscCredentials;

beforeAll(async () => {
  const key = await makeTestKey();
  credentials = await loadAscCredentialsFromEnv(key.envTeam);
  const individualCredentials = await loadAscCredentialsFromEnv(
    key.envIndividual,
  );
  // Two total attempts keep retry-prone categories (429/5xx/network) fast
  // while still proving the retry happened at all.
  const retry = {
    maxAttempts: 2,
    sleep: () => Promise.resolve(),
    random: () => 0.5,
  };
  teamClient = createAscClient({ credentials, retry });
  individualClient = createAscClient({
    credentials: individualCredentials,
    retry,
  });
});

function ascItem(overrides: Partial<AscApiErrorItem>): AscApiErrorItem {
  return {
    code: "ERROR",
    status: "400",
    title: "Error",
    detail: "Detail",
    ...overrides,
  };
}

async function thrownBy(promise: Promise<unknown>): Promise<AscError> {
  const thrown = await promise.then(
    () => expect.fail("expected the call to throw"),
    (error: unknown) => error,
  );
  expect(thrown).toBeInstanceOf(AscError);
  return thrown as AscError;
}

describe("error categories are distinguishable through the full client", () => {
  it("credential: local configuration failures never reach the network", async () => {
    const error = await loadAscCredentialsFromEnv({}).then(
      () => expect.fail("expected a credential error"),
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(AscCredentialError);
    expect((error as AscCredentialError).category).toBe("credential");
  });

  it("authentication: persistent 401 after the single replay", async () => {
    const item = ascItem({ code: "NOT_AUTHORIZED", status: "401" });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps", method: "GET" })
      .reply(401, { errors: [item] })
      .times(2);

    const error = await thrownBy(teamClient.GET("/v1/apps"));

    expect(error).toBeInstanceOf(AscAuthenticationError);
    expect(error.category).toBe("authentication");
    expect(error.apiErrors).toEqual([item]);
  });

  it("permission: 403 names the role problem and the individual-key limits", async () => {
    const item = ascItem({ code: "FORBIDDEN_ERROR", status: "403" });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) => path.startsWith("/v1/salesReports"),
        method: "GET",
      })
      .reply(403, { errors: [item] });

    const error = await thrownBy(
      individualClient.GET("/v1/salesReports", {
        params: {
          query: {
            "filter[frequency]": ["DAILY"],
            "filter[reportSubType]": ["SUMMARY"],
            "filter[reportType]": ["SALES"],
            "filter[vendorNumber]": ["12345678"],
          },
        },
      }),
    );

    expect(error).toBeInstanceOf(AscPermissionError);
    expect(error.category).toBe("permission");
    expect(error.message).toContain("role");
    expect(error.message).toContain("Individual keys cannot access");
    expect(error.apiErrors).toEqual([item]);
  });

  it("not-found: 404 is not disguised and not retried", async () => {
    const item = ascItem({ code: "NOT_FOUND", status: "404" });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps/999", method: "GET" })
      .reply(404, { errors: [item] });

    const error = await thrownBy(
      teamClient.GET("/v1/apps/{id}", { params: { path: { id: "999" } } }),
    );

    expect(error).toBeInstanceOf(AscNotFoundError);
    expect(error.category).toBe("not-found");
    expect(error.apiErrors).toEqual([item]);
  });

  it("invalid-parameter: 400 carries the JSON:API source", async () => {
    const item = ascItem({
      code: "PARAMETER_ERROR.INVALID",
      status: "400",
      source: { parameter: "limit" },
    });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: (path) => path.startsWith("/v1/apps"), method: "GET" })
      .reply(400, { errors: [item] });

    const error = await thrownBy(
      teamClient.GET("/v1/apps", { params: { query: { limit: 200 } } }),
    );

    expect(error).toBeInstanceOf(AscInvalidParameterError);
    expect(error.category).toBe("invalid-parameter");
    expect(error.message).toContain('parameter "limit"');
    expect(error.apiErrors).toEqual([item]);
  });

  it("rate-limit: exhausted 429 retries carry the quota snapshot", async () => {
    const item = ascItem({ code: "RATE_LIMIT_EXCEEDED", status: "429" });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps", method: "GET" })
      .reply(
        429,
        { errors: [item] },
        {
          headers: { "x-rate-limit": "user-hour-lim:3500;user-hour-rem:0;" },
        },
      )
      .times(2);

    const error = await thrownBy(teamClient.GET("/v1/apps"));

    expect(error).toBeInstanceOf(AscRateLimitError);
    expect(error.category).toBe("rate-limit");
    expect(error.rateLimit).toEqual({
      hourlyLimit: 3500,
      remaining: 0,
      raw: "user-hour-lim:3500;user-hour-rem:0;",
    });
    expect(error.apiErrors).toEqual([item]);
  });

  it("upstream: persistent 5xx keeps the ASC response context", async () => {
    const item = ascItem({ code: "UNEXPECTED_ERROR", status: "500" });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps", method: "GET" })
      .reply(500, { errors: [item] })
      .times(2);

    const error = await thrownBy(teamClient.GET("/v1/apps"));

    expect(error).toBeInstanceOf(AscUpstreamError);
    expect(error.category).toBe("upstream");
    expect(error.request?.status).toBe(500);
    expect(error.apiErrors).toEqual([item]);
  });

  it("network: transport failures surface with attempt count and cause", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps", method: "GET" })
      .replyWithError(new Error("connect ECONNREFUSED"))
      .times(2);

    const error = await thrownBy(teamClient.GET("/v1/apps"));

    expect(error).toBeInstanceOf(AscNetworkError);
    expect(error.category).toBe("network");
    expect((error as AscNetworkError).attempts).toBe(2);
    expect(error.cause).toBeDefined();
  });
});
