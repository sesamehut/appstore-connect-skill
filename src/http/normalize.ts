import { ASC_ENV_VARS } from "../auth/credentials.js";
import type { AscKeyForm } from "../auth/credentials.js";
import {
  AscAuthenticationError,
  AscInvalidParameterError,
  AscNotFoundError,
  AscPermissionError,
  AscRateLimitError,
  AscUpstreamError,
} from "../errors.js";
import type { AscApiErrorItem, AscError, AscErrorOptions } from "../errors.js";
import { parseRateLimitHeader } from "./rate-limit.js";

export interface NormalizeContext {
  readonly request: Request;
  /** Drives the key-form hints in authentication and permission messages. */
  readonly keyForm: AscKeyForm;
}

/**
 * Converts a non-OK ASC response into the matching typed error. Consumes the
 * response body; callers hand over the response for good.
 */
export async function ascErrorFromResponse(
  response: Response,
  context: NormalizeContext,
): Promise<AscError> {
  const apiErrors = await readApiErrors(response);
  const rateLimit = parseRateLimitHeader(response.headers.get("x-rate-limit"));
  const options: AscErrorOptions = {
    apiErrors,
    ...(rateLimit !== undefined && { rateLimit }),
    request: {
      method: context.request.method,
      url: context.request.url,
      status: response.status,
    },
  };
  const summary = summarize(apiErrors, response);

  switch (response.status) {
    case 401:
      return new AscAuthenticationError(
        `${summary}. ${keyFormHint(context.keyForm)}`,
        options,
      );
    case 403:
      return new AscPermissionError(
        `${summary}. The API key's role does not grant this operation; a broader ASC role may be required.${
          context.keyForm === "individual"
            ? " Individual keys cannot access provisioning or sales/finance report endpoints; a team key may be needed."
            : ""
        }`,
        options,
      );
    case 404:
      return new AscNotFoundError(summary, options);
    case 400:
    case 409:
    case 422:
      return new AscInvalidParameterError(
        `${summary}${describeSources(apiErrors)}`,
        options,
      );
    case 429:
      return new AscRateLimitError(
        `${summary}. ASC rate limit exhausted${
          rateLimit?.remaining !== undefined
            ? ` (remaining: ${String(rateLimit.remaining)}${
                rateLimit.hourlyLimit !== undefined
                  ? ` of ${String(rateLimit.hourlyLimit)}/hour`
                  : ""
              })`
            : ""
        }; the quota refills over a rolling hour.`,
        options,
      );
    default:
      // 5xx — and any status the contract has no business meaning for
      // (405, 418, ...), which signals server/contract drift rather than a
      // caller mistake.
      return new AscUpstreamError(summary, options);
  }
}

async function readApiErrors(
  response: Response,
): Promise<readonly AscApiErrorItem[]> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "errors" in body &&
      Array.isArray(body.errors)
    ) {
      return body.errors as AscApiErrorItem[];
    }
  } catch {
    // Non-JSON body (a proxy error page, a truncated response): normalize
    // from the status line alone instead of failing the failure path.
  }
  return [];
}

function summarize(
  apiErrors: readonly AscApiErrorItem[],
  response: Response,
): string {
  const first = apiErrors[0];
  if (first === undefined) {
    return `ASC responded ${String(response.status)}${
      response.statusText === "" ? "" : ` ${response.statusText}`
    }`;
  }
  const more =
    apiErrors.length > 1 ? ` (+${String(apiErrors.length - 1)} more)` : "";
  return `${first.code}: ${first.title} — ${first.detail}${more}`;
}

function keyFormHint(keyForm: AscKeyForm): string {
  // A misspelled issuer variable silently flips the inferred key form, so the
  // message spells out the inference and the lever to change it.
  return keyForm === "team"
    ? `Credentials were inferred as a team key because ${ASC_ENV_VARS.issuerId} is set; verify the Issuer ID, Key ID, and private key belong together, or unset ${ASC_ENV_VARS.issuerId} for an individual key.`
    : `Credentials were inferred as an individual key because ${ASC_ENV_VARS.issuerId} is not set; if this is a team key, set ${ASC_ENV_VARS.issuerId} to its Issuer ID.`;
}

function describeSources(apiErrors: readonly AscApiErrorItem[]): string {
  const sources = apiErrors
    .map((item) => item.source)
    .filter((source) => source !== undefined)
    .map((source) =>
      "pointer" in source ? source.pointer : `parameter "${source.parameter}"`,
    );
  return sources.length === 0 ? "" : ` [source: ${sources.join(", ")}]`;
}
