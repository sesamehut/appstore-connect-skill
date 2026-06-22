import { describe, expect, it } from "vitest";

import {
  TEST_ISSUER_ID,
  TEST_KEY_ID,
} from "../../tests/helpers/test-credentials.js";
import { ASC_ENV_VARS } from "./credentials.js";
import {
  inspectCredentialFormat,
  inspectInlinePrivateKey,
} from "./credential-format.js";

const PEM_HEADER = "-----BEGIN PRIVATE KEY-----";

describe("inspectCredentialFormat", () => {
  it("is silent on well-shaped team-key values", () => {
    expect(
      inspectCredentialFormat({
        [ASC_ENV_VARS.keyId]: TEST_KEY_ID,
        [ASC_ENV_VARS.issuerId]: TEST_ISSUER_ID,
      }),
    ).toEqual([]);
  });

  it("is silent on an individual key with no issuer id", () => {
    expect(
      inspectCredentialFormat({ [ASC_ENV_VARS.keyId]: TEST_KEY_ID }),
    ).toEqual([]);
  });

  it("flags the classic Key ID / Issuer ID swap exactly once", () => {
    const warnings = inspectCredentialFormat({
      [ASC_ENV_VARS.keyId]: TEST_ISSUER_ID, // a UUID in the Key ID slot
      [ASC_ENV_VARS.issuerId]: TEST_KEY_ID, // a 10-char code in the Issuer slot
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe("key-issuer-swapped");
    expect(warnings[0]?.message).toContain(ASC_ENV_VARS.keyId);
    expect(warnings[0]?.message).toContain(ASC_ENV_VARS.issuerId);
  });

  it("flags a UUID-shaped Key ID when the issuer slot is empty", () => {
    const warnings = inspectCredentialFormat({
      [ASC_ENV_VARS.keyId]: TEST_ISSUER_ID,
    });

    expect(warnings.map((warning) => warning.code)).toEqual([
      "key-id-looks-like-issuer-id",
    ]);
  });

  it("flags a non-UUID Issuer ID without claiming a swap", () => {
    const warnings = inspectCredentialFormat({
      [ASC_ENV_VARS.keyId]: TEST_KEY_ID,
      [ASC_ENV_VARS.issuerId]: "not-a-uuid",
    });

    expect(warnings.map((warning) => warning.code)).toEqual([
      "issuer-id-not-uuid",
    ]);
  });

  it("flags an oddly-formatted Key ID", () => {
    const warnings = inspectCredentialFormat({
      [ASC_ENV_VARS.keyId]: "short",
    });

    expect(warnings.map((warning) => warning.code)).toEqual([
      "key-id-unusual-format",
    ]);
  });
});

describe("inspectInlinePrivateKey", () => {
  it("returns nothing for an unset or blank value", () => {
    expect(inspectInlinePrivateKey(undefined)).toBeUndefined();
    expect(inspectInlinePrivateKey("   ")).toBeUndefined();
  });

  it("returns nothing for a value that looks like PEM", () => {
    expect(
      inspectInlinePrivateKey(
        `${PEM_HEADER}\nMIG...\n-----END PRIVATE KEY-----`,
      ),
    ).toBeUndefined();
  });

  it("detects a quote-wrapped value", () => {
    const hint = inspectInlinePrivateKey(`"${PEM_HEADER}\n..."`);
    expect(hint).toContain(ASC_ENV_VARS.privateKey);
    expect(hint).toContain("quotes");
  });

  it("detects a value that is not PEM at all", () => {
    const hint = inspectInlinePrivateKey("AuthKey_ABCDE12345.p8");
    expect(hint).toContain(ASC_ENV_VARS.privateKey);
    expect(hint).toContain(ASC_ENV_VARS.privateKeyPath);
  });

  it("never echoes the private key body", () => {
    const secret = "SUPERSECRETKEYBODY";
    const hint = inspectInlinePrivateKey(`"${secret}"`);
    expect(hint).not.toContain(secret);
  });
});
