import { decodeProtectedHeader, jwtVerify } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import {
  makeTestKey,
  TEST_ISSUER_ID,
  TEST_KEY_ID,
} from "../../tests/helpers/test-credentials.js";
import { loadAscCredentialsFromEnv } from "./credentials.js";
import type { AscCredentials } from "./credentials.js";
import {
  ASC_TOKEN_AUDIENCE,
  AscTokenProvider,
  IAT_BACKDATE_SECONDS,
  REFRESH_SAFETY_MARGIN_SECONDS,
  signAscToken,
  TOKEN_LIFETIME_SECONDS,
} from "./token.js";
import type { SignedToken, SignFunction } from "./token.js";

let key: Awaited<ReturnType<typeof makeTestKey>>;
let teamCredentials: AscCredentials;
let individualCredentials: AscCredentials;

beforeAll(async () => {
  key = await makeTestKey();
  teamCredentials = await loadAscCredentialsFromEnv(key.envTeam);
  individualCredentials = await loadAscCredentialsFromEnv(key.envIndividual);
});

describe("signAscToken", () => {
  it("produces a verifiable ES256 JWT with Apple's required header", async () => {
    const { token } = await signAscToken(teamCredentials, Date.now());

    const header = decodeProtectedHeader(token);
    expect(header).toEqual({ alg: "ES256", kid: TEST_KEY_ID, typ: "JWT" });

    // Verifying against the generated public key proves the signature chain,
    // not just the claim shapes.
    await expect(
      jwtVerify(token, key.publicKey, { audience: ASC_TOKEN_AUDIENCE }),
    ).resolves.toBeDefined();
  });

  it("claims the issuer for team keys and no subject", async () => {
    const { token } = await signAscToken(teamCredentials, Date.now());
    const { payload } = await jwtVerify(token, key.publicKey);

    expect(payload.iss).toBe(TEST_ISSUER_ID);
    expect(payload.sub).toBeUndefined();
    expect(payload.aud).toBe(ASC_TOKEN_AUDIENCE);
  });

  it('claims the fixed subject "user" for individual keys and no issuer', async () => {
    const { token } = await signAscToken(individualCredentials, Date.now());
    const { payload } = await jwtVerify(token, key.publicKey);

    expect(payload.sub).toBe("user");
    expect(payload.iss).toBeUndefined();
    expect(payload.aud).toBe(ASC_TOKEN_AUDIENCE);
  });

  it("backdates iat and stays under Apple's 20-minute lifetime cap", async () => {
    const nowMs = Date.now();
    const { token, expiresAtMs } = await signAscToken(teamCredentials, nowMs);
    const { payload } = await jwtVerify(token, key.publicKey);
    const expectedIat = Math.floor(nowMs / 1000) - IAT_BACKDATE_SECONDS;
    const expectedExp = expectedIat + TOKEN_LIFETIME_SECONDS;

    expect(payload.iat).toBe(expectedIat);
    expect(payload.exp).toBe(expectedExp);
    expect(expectedExp - Math.floor(nowMs / 1000)).toBeLessThanOrEqual(20 * 60);
    expect(expiresAtMs).toBe(expectedExp * 1000);
  });
});

interface CountingSign {
  readonly sign: SignFunction;
  readonly count: () => number;
}

function makeCountingSign(
  behavior?: (call: number) => Promise<SignedToken> | undefined,
): CountingSign {
  let calls = 0;
  const sign: SignFunction = (_credentials, nowMs) => {
    calls += 1;
    return (
      behavior?.(calls) ??
      Promise.resolve({
        token: `token-${String(calls)}`,
        expiresAtMs: nowMs + TOKEN_LIFETIME_SECONDS * 1000,
      })
    );
  };
  return { sign, count: () => calls };
}

function makeProvider(options: {
  sign: SignFunction;
  clock?: () => number;
}): AscTokenProvider {
  return new AscTokenProvider(teamCredentials, {
    sign: options.sign,
    clock: options.clock ?? (() => 0),
  });
}

describe("AscTokenProvider reuse and refresh", () => {
  it("reuses the token within the safe window", async () => {
    const counting = makeCountingSign();
    const provider = makeProvider({ sign: counting.sign });

    const first = await provider.getToken();
    const second = await provider.getToken();

    expect(first).toBe(second);
    expect(counting.count()).toBe(1);
  });

  it("re-signs early once the safety margin is reached", async () => {
    let nowMs = 0;
    const counting = makeCountingSign();
    const provider = makeProvider({ sign: counting.sign, clock: () => nowMs });

    const first = await provider.getToken();
    // One second inside the margin: the token is still technically alive but
    // no longer carries the guaranteed minimum remaining lifetime.
    nowMs =
      TOKEN_LIFETIME_SECONDS * 1000 -
      (REFRESH_SAFETY_MARGIN_SECONDS - 1) * 1000;
    const second = await provider.getToken();

    expect(second).not.toBe(first);
    expect(counting.count()).toBe(2);
  });

  it("still reuses just outside the safety margin", async () => {
    let nowMs = 0;
    const counting = makeCountingSign();
    const provider = makeProvider({ sign: counting.sign, clock: () => nowMs });

    const first = await provider.getToken();
    nowMs =
      TOKEN_LIFETIME_SECONDS * 1000 -
      (REFRESH_SAFETY_MARGIN_SECONDS + 1) * 1000;
    const second = await provider.getToken();

    expect(second).toBe(first);
    expect(counting.count()).toBe(1);
  });

  it("shares one in-flight signing across concurrent acquisitions", async () => {
    const counting = makeCountingSign();
    const provider = makeProvider({ sign: counting.sign });

    const tokens = await Promise.all(
      Array.from({ length: 10 }, () => provider.getToken()),
    );

    expect(new Set(tokens).size).toBe(1);
    expect(counting.count()).toBe(1);
  });

  it("does not cache a failed signing", async () => {
    const counting = makeCountingSign((call) =>
      call === 1 ? Promise.reject(new Error("signer unavailable")) : undefined,
    );
    const provider = makeProvider({ sign: counting.sign });

    await expect(provider.getToken()).rejects.toThrow("signer unavailable");
    await expect(provider.getToken()).resolves.toBe("token-2");
    expect(counting.count()).toBe(2);
  });
});

describe("AscTokenProvider forced re-sign", () => {
  it("merges concurrent invalidations of the same stale token", async () => {
    const counting = makeCountingSign();
    const provider = makeProvider({ sign: counting.sign });
    const stale = await provider.getToken();

    const tokens = await Promise.all(
      Array.from({ length: 5 }, () => provider.invalidate(stale)),
    );

    expect(new Set(tokens).size).toBe(1);
    expect(tokens[0]).not.toBe(stale);
    expect(counting.count()).toBe(2);
  });

  it("returns the current token without signing when the stale one was already replaced", async () => {
    const counting = makeCountingSign();
    const provider = makeProvider({ sign: counting.sign });
    const first = await provider.getToken();
    const second = await provider.invalidate(first);

    const third = await provider.invalidate(first);

    expect(third).toBe(second);
    expect(counting.count()).toBe(2);
  });

  it("lets plain acquisitions join a forced re-sign in flight", async () => {
    let release!: (token: SignedToken) => void;
    const gate = new Promise<SignedToken>((resolve) => {
      release = resolve;
    });
    const counting = makeCountingSign((call) =>
      call === 2 ? gate : undefined,
    );
    const provider = makeProvider({ sign: counting.sign });
    const stale = await provider.getToken();

    const forced = provider.invalidate(stale);
    const joined = provider.getToken();
    release({ token: "fresh", expiresAtMs: TOKEN_LIFETIME_SECONDS * 1000 });

    expect(await forced).toBe("fresh");
    expect(await joined).toBe("fresh");
    expect(counting.count()).toBe(2);
  });

  it("recovers after a failed forced re-sign", async () => {
    const counting = makeCountingSign((call) =>
      call === 2 ? Promise.reject(new Error("signer unavailable")) : undefined,
    );
    const provider = makeProvider({ sign: counting.sign });
    const stale = await provider.getToken();

    await expect(provider.invalidate(stale)).rejects.toThrow(
      "signer unavailable",
    );
    await expect(provider.invalidate(stale)).resolves.toBe("token-3");
    expect(counting.count()).toBe(3);
  });
});
