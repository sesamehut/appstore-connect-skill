import { describe, expect, it } from "vitest";

import { CliUsageError } from "./exit-codes.js";
import { csvList, resolvePageLimit, resolveReadScope } from "./read-scope.js";

describe("resolveReadScope", () => {
  it("defaults to the cheapest read: single page", () => {
    expect(resolveReadScope({})).toBe("single-page");
  });

  it("maps --all and --max-items to their scopes", () => {
    expect(resolveReadScope({ all: true })).toBe("all-pages");
    expect(resolveReadScope({ "max-items": "25" })).toEqual({ maxItems: 25 });
  });

  it("rejects conflicting and malformed scope flags", () => {
    expect(() => resolveReadScope({ all: true, "max-items": "5" })).toThrow(
      CliUsageError,
    );
    expect(() => resolveReadScope({ "max-items": "0" })).toThrow(CliUsageError);
    expect(() => resolveReadScope({ "max-items": "2.5" })).toThrow(
      CliUsageError,
    );
    expect(() => resolveReadScope({ "max-items": "lots" })).toThrow(
      CliUsageError,
    );
  });
});

describe("resolvePageLimit", () => {
  it("parses a positive integer and rejects garbage", () => {
    expect(resolvePageLimit({})).toBeUndefined();
    expect(resolvePageLimit({ "page-limit": "200" })).toBe(200);
    expect(() => resolvePageLimit({ "page-limit": "-1" })).toThrow(
      CliUsageError,
    );
  });
});

describe("csvList", () => {
  it("splits, trims, and drops empty entries", () => {
    expect(csvList(undefined)).toBeUndefined();
    expect(csvList("a, b ,c")).toEqual(["a", "b", "c"]);
    expect(csvList(" , ")).toBeUndefined();
  });
});
