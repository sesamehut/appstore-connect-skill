import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ASC_API_BASE_URL, ascApiUrl } from "../src/index.js";

// Proves the M0 exit criterion: the HTTP boundary is mockable at a clear seam.
// MockAgent replaces the global dispatcher behind Node's built-in fetch, so
// production code needs no injection hooks to be testable offline.
describe("HTTP boundary mock seam", () => {
  let agent: MockAgent;
  let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;

  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
  });

  afterEach(async () => {
    agent.assertNoPendingInterceptors();
    setGlobalDispatcher(originalDispatcher);
    await agent.close();
  });

  it("intercepts global fetch against the ASC API origin", async () => {
    agent
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps", method: "GET" })
      .reply(
        200,
        { data: [] },
        { headers: { "content-type": "application/json" } },
      );

    const response = await fetch(ascApiUrl("/v1/apps"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [] });
  });
});
