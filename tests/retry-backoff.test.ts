import { beforeAll, describe, expect, it } from "vitest";

import { loadAscCredentialsFromEnv } from "../src/auth/credentials.js";
import type { AscCredentials } from "../src/auth/credentials.js";
import { AscInvalidParameterError, AscRateLimitError } from "../src/errors.js";
import { ASC_API_BASE_URL, createAscClient } from "../src/http/client.js";
import type { RateLimitSnapshot } from "../src/http/rate-limit.js";
import { useMockAgent } from "./helpers/mock-agent.js";
import { makeTestKey } from "./helpers/test-credentials.js";

const getAgent = useMockAgent();

let credentials: AscCredentials;

beforeAll(async () => {
  const key = await makeTestKey();
  credentials = await loadAscCredentialsFromEnv(key.envTeam);
});

function makeClient(options: {
  maxAttempts: number;
  onRateLimit?: (snapshot: RateLimitSnapshot) => void;
}) {
  return createAscClient({
    credentials,
    ...(options.onRateLimit && { onRateLimit: options.onRateLimit }),
    retry: {
      maxAttempts: options.maxAttempts,
      sleep: () => Promise.resolve(),
      random: () => 0.5,
    },
  });
}

const OK_BODY = {
  data: [],
  links: { self: `${ASC_API_BASE_URL}/v1/apps` },
};

describe("retry through the full client", () => {
  it("recovers from transient 5xx within the budget", async () => {
    const origin = getAgent().get(ASC_API_BASE_URL);
    origin
      .intercept({ path: "/v1/apps", method: "GET" })
      .reply(500, { errors: [] })
      .times(2);
    origin.intercept({ path: "/v1/apps", method: "GET" }).reply(200, OK_BODY);

    const client = makeClient({ maxAttempts: 3 });
    const { response } = await client.GET("/v1/apps");

    expect(response.status).toBe(200);
  });

  it("stops after maxAttempts on persistent 429 and reports every attempt to the observer", async () => {
    const seen: (number | undefined)[] = [];
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps", method: "GET" })
      .reply(
        429,
        { errors: [] },
        {
          headers: { "x-rate-limit": "user-hour-lim:3500;user-hour-rem:1;" },
        },
      )
      .times(3);

    const client = makeClient({
      maxAttempts: 3,
      onRateLimit: (snapshot) => seen.push(snapshot.remaining),
    });
    const thrown = await client.GET("/v1/apps").then(
      () => expect.fail("expected a rate-limit error"),
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(AscRateLimitError);
    // assertNoPendingInterceptors() in teardown proves exactly three
    // requests went out; the observer saw each of them.
    expect(seen).toEqual([1, 1, 1]);
  });

  it("never retries a non-429 4xx", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: (path) => path.startsWith("/v1/apps"), method: "GET" })
      .reply(400, { errors: [] });

    const client = makeClient({ maxAttempts: 3 });
    const thrown = await client
      .GET("/v1/apps", { params: { query: { limit: 1 } } })
      .then(
        () => expect.fail("expected an invalid-parameter error"),
        (error: unknown) => error,
      );

    // A retry would hit an exhausted interceptor and fail differently; the
    // teardown's pending-interceptor assertion completes the proof.
    expect(thrown).toBeInstanceOf(AscInvalidParameterError);
  });

  it("recovers from a transient network failure", async () => {
    const origin = getAgent().get(ASC_API_BASE_URL);
    origin
      .intercept({ path: "/v1/apps", method: "GET" })
      .replyWithError(new Error("socket hang up"));
    origin.intercept({ path: "/v1/apps", method: "GET" }).reply(200, OK_BODY);

    const client = makeClient({ maxAttempts: 2 });
    const { response } = await client.GET("/v1/apps");

    expect(response.status).toBe(200);
  });
});
