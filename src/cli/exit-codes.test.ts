import { describe, expect, it } from "vitest";

import type { AscErrorCategory } from "../errors.js";
import { EXIT, isCittyUsageError, mapAscErrorToExit } from "./exit-codes.js";

describe("mapAscErrorToExit", () => {
  it("partitions categories by the agent's next action", () => {
    const expected: Record<AscErrorCategory, number> = {
      credential: EXIT.configuration,
      authentication: EXIT.ascRequest,
      permission: EXIT.ascRequest,
      "not-found": EXIT.ascRequest,
      "invalid-parameter": EXIT.ascRequest,
      "rate-limit": EXIT.rateLimit,
      upstream: EXIT.ascRequest,
      network: EXIT.ascRequest,
    };
    for (const [category, code] of Object.entries(expected)) {
      expect(mapAscErrorToExit(category as AscErrorCategory)).toBe(code);
    }
  });
});

describe("isCittyUsageError", () => {
  it("recognizes citty's CLIError by name and code", () => {
    const lookalike = Object.assign(new Error("Unknown command"), {
      code: "E_UNKNOWN_COMMAND",
    });
    lookalike.name = "CLIError";
    expect(isCittyUsageError(lookalike)).toBe(true);
    expect(isCittyUsageError(new Error("plain"))).toBe(false);
  });
});
