import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { exportPKCS8, generateKeyPair } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  makeTestKey,
  TEST_ISSUER_ID,
  TEST_KEY_ID,
} from "../../tests/helpers/test-credentials.js";
import { AscCredentialError } from "../errors.js";
import type { CredentialErrorReason } from "../errors.js";
import { ASC_ENV_VARS, loadAscCredentialsFromEnv } from "./credentials.js";

let key: Awaited<ReturnType<typeof makeTestKey>>;
let tempDir: string;

beforeAll(async () => {
  key = await makeTestKey();
  tempDir = await mkdtemp(join(tmpdir(), "asc-skill-test-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function expectCredentialError(
  env: Readonly<Record<string, string | undefined>>,
  reason: CredentialErrorReason,
): Promise<AscCredentialError> {
  try {
    await loadAscCredentialsFromEnv(env);
  } catch (error) {
    expect(error).toBeInstanceOf(AscCredentialError);
    const credentialError = error as AscCredentialError;
    expect(credentialError.reason).toBe(reason);
    return credentialError;
  }
  return expect.fail("expected loadAscCredentialsFromEnv to throw");
}

describe("loadAscCredentialsFromEnv validation", () => {
  it("rejects a missing key ID and names the env var", async () => {
    const error = await expectCredentialError({}, "missing-key-id");

    expect(error.message).toContain(ASC_ENV_VARS.keyId);
  });

  it("treats a blank key ID as missing", async () => {
    await expectCredentialError(
      { [ASC_ENV_VARS.keyId]: "   " },
      "missing-key-id",
    );
  });

  it("rejects when both private key sources are set, naming both vars", async () => {
    const error = await expectCredentialError(
      {
        [ASC_ENV_VARS.keyId]: TEST_KEY_ID,
        [ASC_ENV_VARS.privateKey]: key.pem,
        [ASC_ENV_VARS.privateKeyPath]: join(tempDir, "key.p8"),
      },
      "conflicting-private-key-sources",
    );

    expect(error.message).toContain(ASC_ENV_VARS.privateKey);
    expect(error.message).toContain(ASC_ENV_VARS.privateKeyPath);
  });

  it("rejects when no private key source is set, naming both vars", async () => {
    const error = await expectCredentialError(
      { [ASC_ENV_VARS.keyId]: TEST_KEY_ID },
      "missing-private-key",
    );

    expect(error.message).toContain(ASC_ENV_VARS.privateKey);
    expect(error.message).toContain(ASC_ENV_VARS.privateKeyPath);
  });

  it("rejects an unreadable key file and includes the path", async () => {
    const missingPath = join(tempDir, "does-not-exist.p8");
    const error = await expectCredentialError(
      {
        [ASC_ENV_VARS.keyId]: TEST_KEY_ID,
        [ASC_ENV_VARS.privateKeyPath]: missingPath,
      },
      "unreadable-private-key-file",
    );

    expect(error.message).toContain(missingPath);
  });

  it("rejects a directory as the key file path", async () => {
    await expectCredentialError(
      {
        [ASC_ENV_VARS.keyId]: TEST_KEY_ID,
        [ASC_ENV_VARS.privateKeyPath]: tempDir,
      },
      "unreadable-private-key-file",
    );
  });

  it("rejects garbage PEM content", async () => {
    await expectCredentialError(
      {
        [ASC_ENV_VARS.keyId]: TEST_KEY_ID,
        [ASC_ENV_VARS.privateKey]: "not a pem at all",
      },
      "invalid-private-key",
    );
  });

  it("rejects a valid PEM of the wrong key type (RSA)", async () => {
    const { privateKey } = await generateKeyPair("RS256", {
      extractable: true,
      modulusLength: 2048,
    });
    const rsaPem = await exportPKCS8(privateKey);

    await expectCredentialError(
      {
        [ASC_ENV_VARS.keyId]: TEST_KEY_ID,
        [ASC_ENV_VARS.privateKey]: rsaPem,
      },
      "invalid-private-key",
    );
  });

  it("never leaks key material into error messages", async () => {
    const keyBody = key.pem
      .replace("-----BEGIN PRIVATE KEY-----", "")
      .replace("-----END PRIVATE KEY-----", "")
      .trim();
    const scenarios: Readonly<Record<string, string | undefined>>[] = [
      // Conflicting sources: both values present in env, neither may surface.
      {
        [ASC_ENV_VARS.keyId]: TEST_KEY_ID,
        [ASC_ENV_VARS.privateKey]: key.pem,
        [ASC_ENV_VARS.privateKeyPath]: "x",
      },
      // Truncated PEM: invalid, but still secret-shaped content.
      {
        [ASC_ENV_VARS.keyId]: TEST_KEY_ID,
        [ASC_ENV_VARS.privateKey]: key.pem.slice(0, key.pem.length - 40),
      },
    ];

    for (const env of scenarios) {
      const error = await loadAscCredentialsFromEnv(env).then(
        () => expect.fail("expected a credential error"),
        (thrown: unknown) => thrown as AscCredentialError,
      );
      for (const line of keyBody.split("\n")) {
        expect(error.message).not.toContain(line);
      }
    }
  });
});

describe("loadAscCredentialsFromEnv key forms", () => {
  it("infers a team key when the issuer ID is present", async () => {
    const credentials = await loadAscCredentialsFromEnv(key.envTeam);

    expect(credentials.keyForm).toBe("team");
    expect(credentials.keyId).toBe(TEST_KEY_ID);
    if (credentials.keyForm === "team") {
      expect(credentials.issuerId).toBe(TEST_ISSUER_ID);
    }
  });

  it("infers an individual key when the issuer ID is absent", async () => {
    const credentials = await loadAscCredentialsFromEnv(key.envIndividual);

    expect(credentials.keyForm).toBe("individual");
  });

  it("treats a blank issuer ID as absent", async () => {
    const credentials = await loadAscCredentialsFromEnv({
      ...key.envIndividual,
      [ASC_ENV_VARS.issuerId]: "  ",
    });

    expect(credentials.keyForm).toBe("individual");
  });

  it("loads the private key from a file path", async () => {
    const keyPath = join(tempDir, "AuthKey_TEST.p8");
    await writeFile(keyPath, key.pem, "utf8");

    const credentials = await loadAscCredentialsFromEnv({
      [ASC_ENV_VARS.keyId]: TEST_KEY_ID,
      [ASC_ENV_VARS.privateKeyPath]: keyPath,
    });

    expect(credentials.keyForm).toBe("individual");
    expect(credentials.privateKey.type).toBe("private");
  });

  it("accepts an inline PEM flattened with literal \\n escapes", async () => {
    const flattened = key.pem.replaceAll("\n", "\\n");

    const credentials = await loadAscCredentialsFromEnv({
      [ASC_ENV_VARS.keyId]: TEST_KEY_ID,
      [ASC_ENV_VARS.privateKey]: flattened,
    });

    expect(credentials.privateKey.type).toBe("private");
  });
});
