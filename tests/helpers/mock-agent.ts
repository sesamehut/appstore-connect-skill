import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach } from "vitest";

/**
 * Installs a fresh undici MockAgent around each test. MockAgent replaces the
 * global dispatcher behind Node's built-in fetch — the same dialect the
 * production code speaks — so no injection hooks are needed to run offline.
 *
 * `assertNoPendingInterceptors` in the teardown doubles as an implicit
 * assertion that every scripted exchange was actually consumed.
 */
export function useMockAgent(): () => MockAgent {
  let agent: MockAgent | undefined;
  let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;

  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
  });

  afterEach(async () => {
    if (agent === undefined) {
      return;
    }
    try {
      agent.assertNoPendingInterceptors();
    } finally {
      setGlobalDispatcher(originalDispatcher);
      await agent.close();
      agent = undefined;
    }
  });

  return () => {
    if (agent === undefined) {
      throw new Error("useMockAgent() is only usable inside a test");
    }
    return agent;
  };
}

/**
 * Case-insensitive header lookup over the loosely-typed `headers` value a
 * MockAgent reply callback receives (Headers or a plain record, key casing
 * unspecified).
 */
export function headerValue(
  headers: unknown,
  name: string,
): string | undefined {
  const wanted = name.toLowerCase();
  if (headers instanceof Headers) {
    return headers.get(wanted) ?? undefined;
  }
  if (headers !== null && typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === wanted) {
        if (typeof value === "string") {
          return value;
        }
        if (Array.isArray(value) && typeof value[0] === "string") {
          return value[0];
        }
      }
    }
  }
  return undefined;
}
