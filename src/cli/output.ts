import type { AscError, CredentialErrorReason } from "../errors.js";
import { AscCredentialError } from "../errors.js";
import { ASC_ENV_VARS } from "../auth/credentials.js";
import type { RateLimitSnapshot } from "../http/rate-limit.js";
import type { CollectedRead, ReadScope } from "../pagination/paginate.js";
import type { CliIo } from "./context.js";

/**
 * The single success shape on stdout. On failure stdout stays empty — the
 * exit code plus structured stderr carry the outcome — so "parse stdout" is
 * unconditionally safe for the agent.
 */
export interface ResultEnvelope {
  readonly ok: true;
  readonly command: string;
  readonly data: unknown;
  readonly included?: unknown;
  readonly pagination?: {
    readonly pagesRead: number;
    readonly total?: number;
    readonly truncated: boolean;
    readonly scope: ReadScope;
  };
  readonly rateLimit?: RateLimitSnapshot;
  /** Intermediate resources the CLI resolved on the caller's behalf. */
  readonly resolved?: Readonly<Record<string, unknown>>;
}

export function emitResult(io: CliIo, envelope: ResultEnvelope): void {
  io.out(JSON.stringify(envelope, null, 2));
}

/** Envelope for a paged list read, carrying the honesty diagnostics. */
export function listEnvelope(
  command: string,
  read: CollectedRead<unknown>,
  scope: ReadScope,
  resolved?: Readonly<Record<string, unknown>>,
): ResultEnvelope {
  return {
    ok: true,
    command,
    data: read.items,
    pagination: {
      pagesRead: read.pagesRead,
      ...(read.total !== undefined && { total: read.total }),
      truncated: read.truncated,
      scope,
    },
    ...(read.rateLimit !== undefined && { rateLimit: read.rateLimit }),
    ...(resolved !== undefined && { resolved }),
  };
}

/** Envelope for a single-document read or write. */
export function documentEnvelope(
  command: string,
  document: { readonly data: unknown; readonly included?: unknown },
  options: {
    readonly rateLimit?: RateLimitSnapshot;
    readonly resolved?: Readonly<Record<string, unknown>>;
  } = {},
): ResultEnvelope {
  return {
    ok: true,
    command,
    data: document.data,
    ...(document.included !== undefined && { included: document.included }),
    ...(options.rateLimit !== undefined && { rateLimit: options.rateLimit }),
    ...(options.resolved !== undefined && { resolved: options.resolved }),
  };
}

/**
 * Renders a normalized ASC error as actionable diagnostics ("solve, don't
 * punt"): what failed, what to do next, and whatever progress/quota context
 * the error carries.
 */
export function renderAscError(io: CliIo, error: AscError): void {
  io.err(`error[${error.category}]: ${error.message}`);
  io.err(`hint: ${hintFor(error)}`);
  if (error.apiErrors.length > 0) {
    io.err(
      `api-errors: ${error.apiErrors
        .map((item) => `${item.code} — ${item.title}`)
        .join("; ")}`,
    );
  }
  if (error.pagination !== undefined) {
    io.err(
      `progress: ${String(error.pagination.pagesRead)} page(s), ${String(error.pagination.itemsRead)} item(s) read before the failure`,
    );
  }
  if (error.rateLimit !== undefined) {
    io.err(
      `rate-limit: ${String(error.rateLimit.remaining ?? "?")} of ${String(error.rateLimit.hourlyLimit ?? "?")} hourly requests remaining`,
    );
  }
}

const CREDENTIAL_HINTS: Record<CredentialErrorReason, string> = {
  "missing-key-id": `Set ${ASC_ENV_VARS.keyId} to the App Store Connect API key ID. Keys live in App Store Connect → Users and Access → Integrations.`,
  "missing-private-key": `Set ${ASC_ENV_VARS.privateKey} (inline PEM content) or ${ASC_ENV_VARS.privateKeyPath} (path to the .p8 file) — exactly one of the two.`,
  "conflicting-private-key-sources": `Unset one of ${ASC_ENV_VARS.privateKey} / ${ASC_ENV_VARS.privateKeyPath}; exactly one private key source must be configured.`,
  "unreadable-private-key-file": `Check that the path in ${ASC_ENV_VARS.privateKeyPath} exists and is readable from this shell.`,
  "invalid-private-key": `The private key must be the unmodified .p8 file content downloaded from App Store Connect (PKCS#8 EC P-256).`,
};

function hintFor(error: AscError): string {
  if (error instanceof AscCredentialError) {
    return CREDENTIAL_HINTS[error.reason];
  }
  switch (error.category) {
    case "credential":
      // Unreachable: every credential error is an AscCredentialError.
      return CREDENTIAL_HINTS["missing-key-id"];
    case "authentication":
      return "Verify the key ID, issuer ID, and private key belong to the same App Store Connect API key, and that the key has not been revoked.";
    case "permission":
      return "The API key's role does not cover this operation. Ask the account holder to grant a broader role, or use a different key.";
    case "not-found":
      return "Check the resource id — ids come from the corresponding list command. For review responses, not-found also means no response exists yet.";
    case "invalid-parameter":
      return "ASC rejected the request shape; the [source: ...] pointer in the message locates the offending input. For metadata writes, a STATE_ERROR usually means the target version or app info is not in an editable state.";
    case "rate-limit":
      return "The hourly request quota is exhausted or near the safety floor. Wait for the rolling window to refill, or narrow the read with --max-items.";
    case "upstream":
      return "ASC-side failure. Retry later; if it persists, check Apple's system status page.";
    case "network":
      return "No response from api.appstoreconnect.apple.com. Check connectivity, proxy, and firewall settings.";
  }
}
