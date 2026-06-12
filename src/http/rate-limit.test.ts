import { describe, expect, it } from "vitest";

import { parseRateLimitHeader } from "./rate-limit.js";

describe("parseRateLimitHeader", () => {
  it("parses the documented ASC header shape", () => {
    const snapshot = parseRateLimitHeader(
      "user-hour-lim:3500;user-hour-rem:500;",
    );

    expect(snapshot).toEqual({
      hourlyLimit: 3500,
      remaining: 500,
      raw: "user-hour-lim:3500;user-hour-rem:500;",
    });
  });

  it("tolerates whitespace around segments and values", () => {
    const snapshot = parseRateLimitHeader(
      " user-hour-lim: 3500 ; user-hour-rem: 12 ",
    );

    expect(snapshot?.hourlyLimit).toBe(3500);
    expect(snapshot?.remaining).toBe(12);
  });

  it("ignores unknown segments while keeping known ones", () => {
    const snapshot = parseRateLimitHeader(
      "user-hour-lim:3500;user-day-lim:90000;user-hour-rem:7;",
    );

    expect(snapshot).toEqual({
      hourlyLimit: 3500,
      remaining: 7,
      raw: "user-hour-lim:3500;user-day-lim:90000;user-hour-rem:7;",
    });
  });

  it("omits fields whose segment is missing", () => {
    const snapshot = parseRateLimitHeader("user-hour-rem:42;");

    expect(snapshot).toBeDefined();
    expect(snapshot).not.toHaveProperty("hourlyLimit");
    expect(snapshot?.remaining).toBe(42);
  });

  it("skips non-numeric values instead of failing", () => {
    const snapshot = parseRateLimitHeader(
      "user-hour-lim:lots;user-hour-rem:9;",
    );

    expect(snapshot).not.toHaveProperty("hourlyLimit");
    expect(snapshot?.remaining).toBe(9);
  });

  it("preserves the verbatim header even when nothing parses", () => {
    const snapshot = parseRateLimitHeader("future-field:abc");

    expect(snapshot).toEqual({ raw: "future-field:abc" });
  });

  it("returns undefined for an absent or blank header", () => {
    expect(parseRateLimitHeader(null)).toBeUndefined();
    expect(parseRateLimitHeader("")).toBeUndefined();
    expect(parseRateLimitHeader("   ")).toBeUndefined();
  });
});
