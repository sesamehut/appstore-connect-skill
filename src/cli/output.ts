import type {
  AscError,
  CredentialErrorReason,
  FileProcessingStage,
} from "../errors.js";
import { AscCredentialError, AscFileProcessingError } from "../errors.js";
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
  if (error instanceof AscFileProcessingError) {
    // The stage is the machine-readable discriminant within the category,
    // mirroring how the category itself is machine-readable in the prefix.
    io.err(
      `stage: ${error.stage}${error.target === undefined ? "" : ` (${error.target})`}`,
    );
  }
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

const FILE_PROCESSING_HINTS: Record<FileProcessingStage, string> = {
  download:
    "The file transfer failed mid-stream. Re-run the command; analytics segment URLs are short-lived, so a fresh run fetches fresh URLs.",
  decompress:
    "The downloaded file is not valid gzip — likely corrupted in transit. Re-run the command; if it persists, the report for this date may be malformed on Apple's side.",
  parse:
    "The report landed on disk but could not be parsed for the summary or JSON conversion. The raw file is intact at the reported path; inspect it manually.",
  checksum:
    "The downloaded bytes do not match Apple's checksum. The corrupt file was kept with a .corrupt suffix for inspection; re-run to download again.",
  write:
    "Writing to disk failed. Check the --output path, directory permissions, and free space.",
  "transfer-read":
    "Could not read the local image/video file. Check the --file path exists, is readable, and did not change during the upload.",
  transfer:
    "Uploading the bytes to Apple's upload URL failed. Upload URLs are short-lived — re-run the command to reserve fresh upload operations. A dangling reserved asset can be removed with the matching delete command.",
  commit:
    "Apple rejected the upload commit, usually a checksum mismatch (the file changed during upload, or the wrong file was sent). Re-run the upload.",
  processing:
    "The bytes uploaded but Apple's asset processing reported FAILED — typically wrong dimensions, an unsupported format, or a bad video. The state errors above carry Apple's reason; fix the asset and re-run. The reserved asset can be removed with the matching delete command.",
};

function hintFor(error: AscError): string {
  if (error instanceof AscCredentialError) {
    return CREDENTIAL_HINTS[error.reason];
  }
  if (error instanceof AscFileProcessingError) {
    return FILE_PROCESSING_HINTS[error.stage];
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
      return "Check the resource id — ids come from the corresponding list command. The message above distinguishes a wrong id from a resource that simply does not exist yet (e.g. no data for that date, no response, or no report instances).";
    case "invalid-parameter":
      return "ASC rejected the request shape; the [source: ...] pointer in the message locates the offending input. For metadata writes, a STATE_ERROR usually means the target version or app info is not in an editable state.";
    case "rate-limit":
      return "The hourly request quota is exhausted or near the safety floor. Wait for the rolling window to refill, or narrow the read with --max-items.";
    case "upstream":
      return "ASC-side failure. Retry later; if it persists, check Apple's system status page.";
    case "network":
      return "No response from api.appstoreconnect.apple.com. Check connectivity, proxy, and firewall settings.";
    case "file-processing":
      // Unreachable: every file-processing error is an AscFileProcessingError.
      return FILE_PROCESSING_HINTS.download;
  }
}
