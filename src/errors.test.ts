import { describe, expect, it } from "vitest";

import {
  AscAuthenticationError,
  AscCredentialError,
  AscError,
  AscInvalidParameterError,
  AscNetworkError,
  AscNotFoundError,
  AscPermissionError,
  AscRateLimitError,
  AscRateLimitFloorError,
  AscUpstreamError,
} from "./errors.js";
import type { AscApiErrorItem } from "./errors.js";

describe("AscError hierarchy", () => {
  const instances: [AscError, string][] = [
    [new AscCredentialError("m", "missing-key-id"), "credential"],
    [new AscAuthenticationError("m"), "authentication"],
    [new AscPermissionError("m"), "permission"],
    [new AscNotFoundError("m"), "not-found"],
    [new AscInvalidParameterError("m"), "invalid-parameter"],
    [new AscRateLimitError("m"), "rate-limit"],
    [new AscRateLimitFloorError("m", 100), "rate-limit"],
    [new AscUpstreamError("m"), "upstream"],
    [new AscNetworkError("m", 3), "network"],
  ];

  it("every subclass is an AscError and an Error", () => {
    for (const [error] of instances) {
      expect(error).toBeInstanceOf(AscError);
      expect(error).toBeInstanceOf(Error);
    }
  });

  it("carries a stable category discriminant", () => {
    for (const [error, category] of instances) {
      expect(error.category).toBe(category);
    }
  });

  it("names errors after their class", () => {
    expect(new AscRateLimitError("m").name).toBe("AscRateLimitError");
    expect(new AscNetworkError("m", 1).name).toBe("AscNetworkError");
  });

  it("defaults apiErrors to an empty array", () => {
    expect(new AscNotFoundError("m").apiErrors).toEqual([]);
  });

  it("preserves the raw JSON:API errors verbatim", () => {
    const apiErrors: AscApiErrorItem[] = [
      {
        code: "NOT_FOUND",
        status: "404",
        title: "The specified resource does not exist",
        detail: "There is no App with ID 123",
      },
    ];
    const error = new AscNotFoundError("m", { apiErrors });

    expect(error.apiErrors).toBe(apiErrors);
  });

  it("plumbs cause and request context through", () => {
    const cause = new TypeError("fetch failed");
    const error = new AscNetworkError("m", 4, {
      cause,
      request: { method: "GET", url: "https://example.test/v1/apps" },
    });

    expect(error.cause).toBe(cause);
    expect(error.attempts).toBe(4);
    expect(error.request).toEqual({
      method: "GET",
      url: "https://example.test/v1/apps",
    });
  });

  it("exposes the credential failure reason", () => {
    const error = new AscCredentialError(
      "m",
      "conflicting-private-key-sources",
    );

    expect(error.reason).toBe("conflicting-private-key-sources");
  });

  it("attaches the rate-limit snapshot when provided", () => {
    const snapshot = {
      hourlyLimit: 3500,
      remaining: 0,
      raw: "user-hour-lim:3500;user-hour-rem:0",
    };
    const error = new AscRateLimitError("m", { rateLimit: snapshot });

    expect(error.rateLimit).toBe(snapshot);
  });

  it("attaches pagination progress when provided", () => {
    const error = new AscPermissionError("m", {
      pagination: { pagesRead: 2, itemsRead: 4 },
    });

    expect(error.pagination).toEqual({ pagesRead: 2, itemsRead: 4 });
    expect(new AscPermissionError("m").pagination).toBeUndefined();
  });

  it("keeps the floor error within the rate-limit family", () => {
    const error = new AscRateLimitFloorError("m", 100, {
      pagination: { pagesRead: 1, itemsRead: 2 },
      rateLimit: { remaining: 50, raw: "user-hour-rem:50" },
    });

    expect(error).toBeInstanceOf(AscRateLimitError);
    expect(error.name).toBe("AscRateLimitFloorError");
    expect(error.floor).toBe(100);
    expect(error.rateLimit?.remaining).toBe(50);
    expect(error.pagination?.pagesRead).toBe(1);
  });
});
