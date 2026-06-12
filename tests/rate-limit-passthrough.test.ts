import { beforeAll, describe, expect, it } from "vitest";

import { loadAscCredentialsFromEnv } from "../src/auth/credentials.js";
import type { AscCredentials } from "../src/auth/credentials.js";
import { AscRateLimitError } from "../src/errors.js";
import { ASC_API_BASE_URL, createAscClient } from "../src/http/client.js";
import type {
  RateLimitObserverContext,
  RateLimitSnapshot,
} from "../src/http/rate-limit.js";
import { useMockAgent } from "./helpers/mock-agent.js";
import { makeTestKey } from "./helpers/test-credentials.js";

const getAgent = useMockAgent();

let credentials: AscCredentials;

beforeAll(async () => {
  const key = await makeTestKey();
  credentials = await loadAscCredentialsFromEnv(key.envTeam);
});

const RATE_HEADER = { "x-rate-limit": "user-hour-lim:3500;user-hour-rem:42;" };

describe("rate-limit passthrough", () => {
  it("hands the observer one snapshot per response, with request context", async () => {
    const snapshots: RateLimitSnapshot[] = [];
    const contexts: RateLimitObserverContext[] = [];
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps", method: "GET" })
      .reply(
        200,
        { data: [], links: { self: `${ASC_API_BASE_URL}/v1/apps` } },
        { headers: RATE_HEADER },
      );

    const client = createAscClient({
      credentials,
      onRateLimit: (snapshot, context) => {
        snapshots.push(snapshot);
        contexts.push(context);
      },
    });
    await client.GET("/v1/apps");

    expect(snapshots).toEqual([
      {
        hourlyLimit: 3500,
        remaining: 42,
        raw: "user-hour-lim:3500;user-hour-rem:42;",
      },
    ]);
    expect(contexts).toEqual([
      {
        method: "GET",
        url: `${ASC_API_BASE_URL}/v1/apps`,
        status: 200,
      },
    ]);
  });

  it("keeps success payloads free of rate-limit data", async () => {
    const body = {
      data: [{ type: "apps", id: "1" }],
      links: { self: `${ASC_API_BASE_URL}/v1/apps` },
    };
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps", method: "GET" })
      .reply(200, body, { headers: RATE_HEADER });

    const client = createAscClient({
      credentials,
      onRateLimit: () => undefined,
    });
    const { data } = await client.GET("/v1/apps");

    // Deep equality against the wire body: the snapshot reaches the observer
    // and errors, never the data the contract types promise.
    expect(data).toEqual(body);
  });

  it("attaches the same snapshot the observer saw to rate-limit errors", async () => {
    const seen: RateLimitSnapshot[] = [];
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps", method: "GET" })
      .reply(429, { errors: [] }, { headers: RATE_HEADER });

    const client = createAscClient({
      credentials,
      onRateLimit: (snapshot) => seen.push(snapshot),
      retry: { maxAttempts: 1 },
    });
    const thrown = await client.GET("/v1/apps").then(
      () => expect.fail("expected a rate-limit error"),
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(AscRateLimitError);
    expect((thrown as AscRateLimitError).rateLimit).toEqual(seen[0]);
  });

  it("does not let a throwing observer affect the request", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps", method: "GET" })
      .reply(
        200,
        { data: [], links: { self: `${ASC_API_BASE_URL}/v1/apps` } },
        { headers: RATE_HEADER },
      );

    const client = createAscClient({
      credentials,
      onRateLimit: () => {
        throw new Error("observer bug");
      },
    });
    const { response } = await client.GET("/v1/apps");

    expect(response.status).toBe(200);
  });
});
