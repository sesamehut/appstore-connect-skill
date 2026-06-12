import { readFile } from "node:fs/promises";

import { importPKCS8 } from "jose";
import type { CryptoKey } from "jose";

import { AscCredentialError } from "../errors.js";

export type AscKeyForm = "team" | "individual";

interface AscCredentialsBase {
  readonly keyId: string;
  /**
   * Imported as a non-extractable CryptoKey: the PEM text is never retained,
   * so even a dumped credentials object cannot leak key material.
   */
  readonly privateKey: CryptoKey;
}

export interface TeamKeyCredentials extends AscCredentialsBase {
  readonly keyForm: "team";
  readonly issuerId: string;
}

export interface IndividualKeyCredentials extends AscCredentialsBase {
  readonly keyForm: "individual";
}

export type AscCredentials = TeamKeyCredentials | IndividualKeyCredentials;

export const ASC_ENV_VARS = {
  keyId: "ASC_KEY_ID",
  issuerId: "ASC_ISSUER_ID",
  privateKey: "ASC_PRIVATE_KEY",
  privateKeyPath: "ASC_PRIVATE_KEY_PATH",
} as const;

/**
 * Loads and validates ASC API credentials. Async because the private key is
 * imported into a CryptoKey here: a malformed key fails at load time with a
 * distinct error instead of surfacing later inside a request.
 *
 * The key form is inferred from the presence of the Issuer ID variable —
 * present means team key, absent means individual key. There is no explicit
 * form switch; authentication errors spell out the inferred form so a
 * misspelled Issuer ID variable is diagnosable.
 *
 * Error messages may name env vars and file paths (configuration), but never
 * credential values.
 */
export async function loadAscCredentialsFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<AscCredentials> {
  const keyId = env[ASC_ENV_VARS.keyId]?.trim();
  if (keyId === undefined || keyId === "") {
    throw new AscCredentialError(
      `${ASC_ENV_VARS.keyId} is not set; it must hold the App Store Connect API key ID`,
      "missing-key-id",
    );
  }

  const privateKey = await importPrivateKey(await loadPrivateKeyPem(env));

  const issuerId = env[ASC_ENV_VARS.issuerId]?.trim();
  if (issuerId !== undefined && issuerId !== "") {
    return { keyForm: "team", keyId, issuerId, privateKey };
  }
  return { keyForm: "individual", keyId, privateKey };
}

async function loadPrivateKeyPem(
  env: Readonly<Record<string, string | undefined>>,
): Promise<string> {
  const inline = env[ASC_ENV_VARS.privateKey]?.trim();
  const path = env[ASC_ENV_VARS.privateKeyPath]?.trim();
  const hasInline = inline !== undefined && inline !== "";
  const hasPath = path !== undefined && path !== "";

  // No silent precedence: picking one source behind the user's back would
  // turn a stale leftover variable into a hard-to-trace auth failure.
  if (hasInline && hasPath) {
    throw new AscCredentialError(
      `Both ${ASC_ENV_VARS.privateKey} and ${ASC_ENV_VARS.privateKeyPath} are set; configure exactly one private key source`,
      "conflicting-private-key-sources",
    );
  }
  if (hasInline) {
    return inline;
  }
  if (!hasPath) {
    throw new AscCredentialError(
      `No private key configured; set ${ASC_ENV_VARS.privateKey} (inline PEM content) or ${ASC_ENV_VARS.privateKeyPath} (path to the .p8 file)`,
      "missing-private-key",
    );
  }
  try {
    return await readFile(path, "utf8");
  } catch (cause) {
    throw new AscCredentialError(
      `Cannot read the private key file at "${path}" (from ${ASC_ENV_VARS.privateKeyPath})`,
      "unreadable-private-key-file",
      { cause },
    );
  }
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // CI secret stores commonly flatten the PEM onto one line with literal \n
  // escapes; valid PEM never contains a backslash, so undoing the escape is
  // safe for well-formed input.
  const normalized = pem.replaceAll("\\n", "\n").trim();
  try {
    return await importPKCS8(normalized, "ES256");
  } catch (cause) {
    // Deliberately does not echo any part of the input: this message may end
    // up in logs, and the input is a private key (or a typo'd attempt at one).
    throw new AscCredentialError(
      "The configured private key is not a valid PKCS#8 EC P-256 (.p8) PEM",
      "invalid-private-key",
      { cause },
    );
  }
}
