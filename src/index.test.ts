import { describe, expect, it } from "vitest";

import { ASC_API_BASE_URL, ascApiUrl } from "./index.js";

describe("ascApiUrl", () => {
  it("joins a slash-prefixed path onto the ASC API origin", () => {
    expect(ascApiUrl("/v1/apps").href).toBe(`${ASC_API_BASE_URL}/v1/apps`);
  });

  it("rejects paths without a leading slash", () => {
    expect(() => ascApiUrl("v1/apps")).toThrow("must start with");
  });
});
