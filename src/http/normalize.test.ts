import { describe, expect, it } from "vitest";

import { ASC_ENV_VARS } from "../auth/credentials.js";
import {
  AscAuthenticationError,
  AscInvalidParameterError,
  AscNotFoundError,
  AscPermissionError,
  AscRateLimitError,
  AscUpstreamError,
} from "../errors.js";
import type { AscApiErrorItem } from "../errors.js";
import { ascErrorFromResponse } from "./normalize.js";
import type { NormalizeContext } from "./normalize.js";

const URL_UNDER_TEST = "https://example.test/v1/apps/123";

function makeContext(
  keyForm: "team" | "individual" = "team",
): NormalizeContext {
  return { request: new Request(URL_UNDER_TEST), keyForm };
}

function apiError(overrides: Partial<AscApiErrorItem> = {}): AscApiErrorItem {
  return {
    code: "NOT_FOUND",
    status: "404",
    title: "The specified resource does not exist",
    detail: "There is no App with ID 123",
    ...overrides,
  };
}

function errorResponse(
  status: number,
  errors: AscApiErrorItem[],
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ errors }), { status, headers });
}

describe("ascErrorFromResponse status mapping", () => {
  it.each([
    [401, AscAuthenticationError],
    [403, AscPermissionError],
    [404, AscNotFoundError],
    [400, AscInvalidParameterError],
    [409, AscInvalidParameterError],
    [422, AscInvalidParameterError],
    [429, AscRateLimitError],
    [500, AscUpstreamError],
    [502, AscUpstreamError],
    // An unrecognized 4xx signals contract/server drift, not a caller
    // mistake; it must not masquerade as invalid input.
    [405, AscUpstreamError],
  ])("maps %i to %o", async (status, expectedClass) => {
    const error = await ascErrorFromResponse(
      errorResponse(status, [apiError({ status: String(status) })]),
      makeContext(),
    );

    expect(error).toBeInstanceOf(expectedClass);
    expect(error.request?.status).toBe(status);
  });

  it("preserves the raw JSON:API errors and request context", async () => {
    const items = [
      apiError(),
      apiError({ code: "ENTITY_UNKNOWN", title: "Second", detail: "More" }),
    ];

    const error = await ascErrorFromResponse(
      errorResponse(404, items),
      makeContext(),
    );

    expect(error.apiErrors).toEqual(items);
    expect(error.request).toEqual({
      method: "GET",
      url: URL_UNDER_TEST,
      status: 404,
    });
    expect(error.message).toContain("NOT_FOUND");
    expect(error.message).toContain("+1 more");
  });

  it("falls back to the status line for a non-JSON body", async () => {
    const error = await ascErrorFromResponse(
      new Response("<html>Bad Gateway</html>", {
        status: 502,
        statusText: "Bad Gateway",
      }),
      makeContext(),
    );

    expect(error).toBeInstanceOf(AscUpstreamError);
    expect(error.apiErrors).toEqual([]);
    expect(error.message).toContain("502");
  });
});

describe("ascErrorFromResponse message shaping", () => {
  it("points invalid-parameter errors at their JSON:API sources", async () => {
    const error = await ascErrorFromResponse(
      errorResponse(400, [
        apiError({
          code: "PARAMETER_ERROR.INVALID",
          status: "400",
          title: "A parameter has an invalid value",
          detail: "'limit' exceeds the maximum",
          source: { parameter: "limit" },
        }),
        apiError({
          code: "ENTITY_ERROR.ATTRIBUTE.REQUIRED",
          status: "400",
          title: "Attribute required",
          detail: "name is required",
          source: { pointer: "/data/attributes/name" },
        }),
      ]),
      makeContext(),
    );

    expect(error.message).toContain('parameter "limit"');
    expect(error.message).toContain("/data/attributes/name");
  });

  it("explains the team key-form inference on authentication failures", async () => {
    const error = await ascErrorFromResponse(
      errorResponse(401, [
        apiError({
          code: "NOT_AUTHORIZED",
          status: "401",
          title: "Auth",
          detail: "x",
        }),
      ]),
      makeContext("team"),
    );

    expect(error.message).toContain("team key");
    expect(error.message).toContain(ASC_ENV_VARS.issuerId);
  });

  it("explains the individual key-form inference on authentication failures", async () => {
    const error = await ascErrorFromResponse(
      errorResponse(401, [
        apiError({
          code: "NOT_AUTHORIZED",
          status: "401",
          title: "Auth",
          detail: "x",
        }),
      ]),
      makeContext("individual"),
    );

    expect(error.message).toContain("individual key");
    expect(error.message).toContain(ASC_ENV_VARS.issuerId);
  });

  it("adds the individual-key capability hint to permission errors", async () => {
    const forbidden = apiError({
      code: "FORBIDDEN_ERROR",
      status: "403",
      title: "Forbidden",
      detail: "Not allowed",
    });

    const individual = await ascErrorFromResponse(
      errorResponse(403, [forbidden]),
      makeContext("individual"),
    );
    const team = await ascErrorFromResponse(
      errorResponse(403, [forbidden]),
      makeContext("team"),
    );

    expect(individual.message).toContain("Individual keys cannot access");
    expect(team.message).not.toContain("Individual keys cannot access");
    expect(team.message).toContain("role");
  });

  it("attaches the rate-limit snapshot and surfaces the remaining quota", async () => {
    const error = await ascErrorFromResponse(
      errorResponse(
        429,
        [
          apiError({
            code: "RATE_LIMIT_EXCEEDED",
            status: "429",
            title: "Rate limited",
            detail: "Too many requests",
          }),
        ],
        { "x-rate-limit": "user-hour-lim:3500;user-hour-rem:0;" },
      ),
      makeContext(),
    );

    expect(error).toBeInstanceOf(AscRateLimitError);
    expect(error.rateLimit).toEqual({
      hourlyLimit: 3500,
      remaining: 0,
      raw: "user-hour-lim:3500;user-hour-rem:0;",
    });
    expect(error.message).toContain("remaining: 0 of 3500/hour");
  });
});
