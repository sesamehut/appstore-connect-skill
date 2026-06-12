import { describe, expect, it } from "vitest";

import { AscNetworkError } from "../errors.js";
import type {
  RateLimitObserverContext,
  RateLimitSnapshot,
} from "./rate-limit.js";
import { createRetryingFetch } from "./transport.js";

const URL_UNDER_TEST = "https://example.test/v1/apps";
const RATE_HEADER = { "x-rate-limit": "user-hour-lim:3500;user-hour-rem:7;" };

function scriptedFetch(script: (Response | Error)[]) {
  const calls: Request[] = [];
  const fetchImpl = (request: Request): Promise<Response> => {
    calls.push(request);
    const step = script[Math.min(calls.length, script.length) - 1];
    if (step === undefined) {
      throw new Error("scripted fetch called with an empty script");
    }
    return step instanceof Error
      ? Promise.reject(step)
      : Promise.resolve(step.clone());
  };
  return { fetchImpl, calls };
}

function recordingSleep() {
  const delays: number[] = [];
  const sleep = (ms: number): Promise<void> => {
    delays.push(ms);
    return Promise.resolve();
  };
  return { sleep, delays };
}

function makeTransport(
  script: (Response | Error)[],
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    random?: () => number;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    onRateLimit?: (
      snapshot: RateLimitSnapshot,
      context: RateLimitObserverContext,
    ) => void;
  } = {},
) {
  const { fetchImpl, calls } = scriptedFetch(script);
  const { sleep, delays } = recordingSleep();
  const transport = createRetryingFetch({
    fetch: fetchImpl,
    ...(options.onRateLimit && { onRateLimit: options.onRateLimit }),
    retry: {
      maxAttempts: options.maxAttempts ?? 3,
      baseDelayMs: options.baseDelayMs ?? 100,
      maxDelayMs: options.maxDelayMs ?? 4000,
      random: options.random ?? (() => 0.5),
      sleep: options.sleep ?? sleep,
    },
  });
  return { transport, calls, delays };
}

describe("createRetryingFetch retry policy", () => {
  it("retries 429 up to the cap and returns the final response unthrown", async () => {
    const { transport, calls, delays } = makeTransport([
      new Response(null, { status: 429 }),
    ]);

    const response = await transport(new Request(URL_UNDER_TEST));

    expect(response.status).toBe(429);
    expect(calls).toHaveLength(3);
    expect(delays).toHaveLength(2);
  });

  it("recovers when a 5xx clears up within the budget", async () => {
    const { transport, calls } = makeTransport([
      new Response(null, { status: 500 }),
      new Response(null, { status: 503 }),
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    ]);

    const response = await transport(new Request(URL_UNDER_TEST));

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(3);
  });

  it.each([400, 403, 404, 422])("does not retry a %i", async (status) => {
    const { transport, calls } = makeTransport([
      new Response(null, { status }),
    ]);

    const response = await transport(new Request(URL_UNDER_TEST));

    expect(response.status).toBe(status);
    expect(calls).toHaveLength(1);
  });

  it("wraps persistent network failures with the attempt count and cause", async () => {
    const cause = new TypeError("fetch failed");
    const { transport, calls } = makeTransport([cause]);

    const error = await transport(new Request(URL_UNDER_TEST)).then(
      () => expect.fail("expected a network error"),
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(AscNetworkError);
    const networkError = error as AscNetworkError;
    expect(networkError.attempts).toBe(3);
    expect(networkError.cause).toBe(cause);
    expect(networkError.request?.url).toBe(URL_UNDER_TEST);
    expect(calls).toHaveLength(3);
  });

  it("recovers from a transient network failure", async () => {
    const { transport, calls } = makeTransport([
      new TypeError("fetch failed"),
      new Response(null, { status: 200 }),
    ]);

    const response = await transport(new Request(URL_UNDER_TEST));

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("applies full-jitter exponential backoff", async () => {
    const { transport, delays } = makeTransport(
      [new Response(null, { status: 500 })],
      { maxAttempts: 4 },
    );

    await transport(new Request(URL_UNDER_TEST));

    // random() = 0.5 against base 100 ms: 0.5 * min(4000, 100 * 2^(n-1)).
    expect(delays).toEqual([50, 100, 200]);
  });

  it("caps the backoff window at maxDelayMs", async () => {
    const { transport, delays } = makeTransport(
      [new Response(null, { status: 500 })],
      { maxAttempts: 4, maxDelayMs: 150 },
    );

    await transport(new Request(URL_UNDER_TEST));

    expect(delays).toEqual([50, 75, 75]);
  });
});

describe("createRetryingFetch request handling", () => {
  it("never consumes the input request; every attempt carries the body", async () => {
    const bodies: string[] = [];
    const fetchImpl = async (request: Request): Promise<Response> => {
      bodies.push(await request.text());
      return new Response(null, { status: 500 });
    };
    const transport = createRetryingFetch({
      fetch: fetchImpl,
      retry: {
        maxAttempts: 3,
        sleep: () => Promise.resolve(),
        random: () => 0.5,
      },
    });
    const original = new Request(URL_UNDER_TEST, {
      method: "POST",
      body: JSON.stringify({ name: "x" }),
    });

    await transport(original);

    expect(bodies).toEqual([
      JSON.stringify({ name: "x" }),
      JSON.stringify({ name: "x" }),
      JSON.stringify({ name: "x" }),
    ]);
    expect(original.bodyUsed).toBe(false);
  });

  it("rejects immediately on a pre-aborted signal without attempting", async () => {
    const { transport, calls } = makeTransport([
      new Response(null, { status: 200 }),
    ]);
    const controller = new AbortController();
    controller.abort();

    await expect(
      transport(new Request(URL_UNDER_TEST, { signal: controller.signal })),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toHaveLength(0);
  });

  it("propagates an abort raised during backoff verbatim", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    const { transport } = makeTransport([new Response(null, { status: 500 })], {
      sleep: () => Promise.reject(abort),
    });

    const error = await transport(new Request(URL_UNDER_TEST)).then(
      () => expect.fail("expected an abort"),
      (thrown: unknown) => thrown,
    );

    expect(error).toBe(abort);
  });
});

describe("createRetryingFetch rate-limit observation", () => {
  it("notifies the observer once per attempt, including retried ones", async () => {
    const seen: { remaining: number | undefined; status: number }[] = [];
    const { transport } = makeTransport(
      [
        new Response(null, { status: 429, headers: RATE_HEADER }),
        new Response(null, { status: 429, headers: RATE_HEADER }),
        new Response(null, { status: 200, headers: RATE_HEADER }),
      ],
      {
        onRateLimit: (snapshot, context) => {
          seen.push({ remaining: snapshot.remaining, status: context.status });
          expect(context.method).toBe("GET");
          expect(context.url).toBe(URL_UNDER_TEST);
        },
      },
    );

    await transport(new Request(URL_UNDER_TEST));

    expect(seen).toEqual([
      { remaining: 7, status: 429 },
      { remaining: 7, status: 429 },
      { remaining: 7, status: 200 },
    ]);
  });

  it("stays silent when the header is absent", async () => {
    let notified = false;
    const { transport } = makeTransport([new Response(null, { status: 200 })], {
      onRateLimit: () => {
        notified = true;
      },
    });

    await transport(new Request(URL_UNDER_TEST));

    expect(notified).toBe(false);
  });

  it("survives a throwing observer", async () => {
    const { transport } = makeTransport(
      [new Response(null, { status: 200, headers: RATE_HEADER })],
      {
        onRateLimit: () => {
          throw new Error("observer bug");
        },
      },
    );

    const response = await transport(new Request(URL_UNDER_TEST));

    expect(response.status).toBe(200);
  });
});
