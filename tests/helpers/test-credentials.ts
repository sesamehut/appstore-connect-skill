import { exportPKCS8, generateKeyPair } from "jose";
import type { CryptoKey } from "jose";

import { ASC_ENV_VARS } from "../../src/auth/credentials.js";

export const TEST_KEY_ID = "TESTKEY1D2";
export const TEST_ISSUER_ID = "69a6de70-0000-47e3-e053-5b8c7c11a4d1";

export interface TestKeyMaterial {
  /** Public half, for verifying signatures produced by the code under test. */
  readonly publicKey: CryptoKey;
  readonly pem: string;
  /** Env record for the team-key form (issuer ID present). */
  readonly envTeam: Record<string, string>;
  /** Env record for the individual-key form (no issuer ID). */
  readonly envIndividual: Record<string, string>;
}

/**
 * Generates a fresh EC P-256 key pair per call: no PEM fixture ever sits in
 * the repo (secret scanners stay quiet, bad habits stay unlearned), and the
 * key is unrelated to any real ASC credential by construction, so the
 * fixtures cannot authenticate against Apple.
 */
export async function makeTestKey(): Promise<TestKeyMaterial> {
  // jose generates non-extractable keys by default; export requires opting in.
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const pem = await exportPKCS8(privateKey);
  return {
    publicKey,
    pem,
    envTeam: {
      [ASC_ENV_VARS.keyId]: TEST_KEY_ID,
      [ASC_ENV_VARS.issuerId]: TEST_ISSUER_ID,
      [ASC_ENV_VARS.privateKey]: pem,
    },
    envIndividual: {
      [ASC_ENV_VARS.keyId]: TEST_KEY_ID,
      [ASC_ENV_VARS.privateKey]: pem,
    },
  };
}
