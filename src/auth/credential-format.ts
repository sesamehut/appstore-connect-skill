import { ASC_ENV_VARS } from "./credentials.js";

/**
 * Advisory, offline format heuristics for the ASC credential env vars. They
 * never reject a credential — Apple's identifier formats are conventions, not a
 * contract this project owns — they only flag the most common copy-paste
 * mistakes (swapping the Key ID and Issuer ID, a quoted or non-PEM private key)
 * before a doomed network round-trip. Messages name env vars, never values.
 */

export interface CredentialFormatWarning {
  /** Machine-readable discriminant, stable for callers that branch on it. */
  readonly code:
    | "key-issuer-swapped"
    | "key-id-looks-like-issuer-id"
    | "key-id-unusual-format"
    | "issuer-id-not-uuid";
  readonly message: string;
}

// ASC Key IDs are a fixed 10-character alphanumeric code; Issuer IDs are UUIDs.
const KEY_ID_SHAPE = /^[A-Za-z0-9]{10}$/;
const UUID_SHAPE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const {
  keyId: KEY_ID,
  issuerId: ISSUER_ID,
  privateKey: PRIVATE_KEY,
} = ASC_ENV_VARS;

/**
 * Inspects the raw env for likely-wrong (but still loadable) Key ID / Issuer ID
 * values. Returns one warning per distinct mistake; an empty array means the
 * shapes look right. A loaded credential that trips one of these still works if
 * Apple disagrees with the heuristic — hence advisory, never a hard failure.
 */
export function inspectCredentialFormat(
  env: Readonly<Record<string, string | undefined>>,
): CredentialFormatWarning[] {
  const warnings: CredentialFormatWarning[] = [];
  const keyId = env[KEY_ID]?.trim();
  const issuerId = env[ISSUER_ID]?.trim();
  const keyLooksLikeIssuer =
    keyId !== undefined && keyId !== "" && UUID_SHAPE.test(keyId);
  const issuerLooksLikeKey =
    issuerId !== undefined && issuerId !== "" && KEY_ID_SHAPE.test(issuerId);

  // The classic mistake: both fields are present and each holds the other's
  // shape. Report it once and stop, so the two single-field rules below do not
  // also fire and triple the noise.
  if (keyLooksLikeIssuer && issuerLooksLikeKey) {
    warnings.push({
      code: "key-issuer-swapped",
      message: `${KEY_ID} holds a UUID and ${ISSUER_ID} holds a 10-character code — these look swapped. ${KEY_ID} is the short 10-character Key ID shown next to the key; ${ISSUER_ID} is the UUID shown above the keys list in Users and Access → Integrations.`,
    });
    return warnings;
  }

  if (keyLooksLikeIssuer) {
    warnings.push({
      code: "key-id-looks-like-issuer-id",
      message: `${KEY_ID} looks like a UUID, which is the shape of an Issuer ID, not a Key ID. Copy the short 10-character Key ID shown next to the key in Users and Access → Integrations; for a Team key the UUID belongs in ${ISSUER_ID}.`,
    });
  } else if (keyId !== undefined && keyId !== "" && !KEY_ID_SHAPE.test(keyId)) {
    warnings.push({
      code: "key-id-unusual-format",
      message: `${KEY_ID} is not the usual 10-character Key ID format; double-check you copied the Key ID itself (not the key's name).`,
    });
  }

  if (issuerId !== undefined && issuerId !== "" && !UUID_SHAPE.test(issuerId)) {
    warnings.push({
      code: "issuer-id-not-uuid",
      message: issuerLooksLikeKey
        ? `${ISSUER_ID} looks like a 10-character Key ID, not the expected UUID. The Issuer ID is the UUID shown above the keys list in Users and Access → Integrations; an individual key has no Issuer ID (leave ${ISSUER_ID} unset).`
        : `${ISSUER_ID} is not in UUID format. The Issuer ID is the UUID shown above the API keys list in Users and Access → Integrations; an individual key has no Issuer ID (leave ${ISSUER_ID} unset).`,
    });
  }

  return warnings;
}

/**
 * A targeted hint for an inline private key that failed to import. Detects the
 * two mistakes that produce secret-shaped but unparseable input — wrapping the
 * value in quotes, or pasting something that is not PEM at all — without ever
 * echoing the value. Returns undefined when nothing obvious is wrong.
 */
export function inspectInlinePrivateKey(
  raw: string | undefined,
): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = raw.trim();
  if (value === "") {
    return undefined;
  }
  if (/^["']/.test(value) || /["']$/.test(value)) {
    return `${PRIVATE_KEY} appears wrapped in quotes — remove the surrounding " or ' so the value begins with "-----BEGIN".`;
  }
  if (!value.includes("-----BEGIN")) {
    return `${PRIVATE_KEY} does not contain a "-----BEGIN ...-----" line; paste the full contents of the .p8 file, or set ${ASC_ENV_VARS.privateKeyPath} to the file path instead.`;
  }
  return undefined;
}
