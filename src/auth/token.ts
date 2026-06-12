import { SignJWT } from "jose";

import type { AscCredentials } from "./credentials.js";

export const ASC_TOKEN_AUDIENCE = "appstoreconnect-v1";

/**
 * Apple caps token lifetime at 20 minutes. 15 keeps the reuse window long
 * while leaving headroom for a locally fast clock that would otherwise push
 * `exp` past Apple's limit.
 */
export const TOKEN_LIFETIME_SECONDS = 15 * 60;

/** Backdating `iat` keeps a slightly fast local clock from minting tokens Apple considers "from the future". */
export const IAT_BACKDATE_SECONDS = 10;

/** Callers always receive a token with at least this much lifetime left. */
export const REFRESH_SAFETY_MARGIN_SECONDS = 60;

export interface SignedToken {
  readonly token: string;
  /** `exp` in epoch milliseconds. */
  readonly expiresAtMs: number;
}

export type SignFunction = (
  credentials: AscCredentials,
  nowMs: number,
) => Promise<SignedToken>;

/**
 * Pure credentials + wall clock → signed JWT. Apple requires ES256 with
 * `kid` in the header; team keys claim `iss` (the Issuer ID) while
 * individual keys must instead claim the fixed subject `user`.
 */
export const signAscToken: SignFunction = async (credentials, nowMs) => {
  const issuedAt = Math.floor(nowMs / 1000) - IAT_BACKDATE_SECONDS;
  const expiresAt = issuedAt + TOKEN_LIFETIME_SECONDS;

  let jwt = new SignJWT(
    credentials.keyForm === "individual" ? { sub: "user" } : {},
  )
    .setProtectedHeader({ alg: "ES256", kid: credentials.keyId, typ: "JWT" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .setAudience(ASC_TOKEN_AUDIENCE);
  if (credentials.keyForm === "team") {
    jwt = jwt.setIssuer(credentials.issuerId);
  }

  return {
    token: await jwt.sign(credentials.privateKey),
    expiresAtMs: expiresAt * 1000,
  };
};

export interface TokenProviderOptions {
  /** Epoch-ms clock. Test seam for expiry windows. */
  readonly clock?: () => number;
  /** Signing function. Test seam for counting signings. */
  readonly sign?: SignFunction;
}

/**
 * Owns the token lifecycle: reuse within the safe window, early re-sign near
 * expiry, and single-flight on both refresh paths — concurrent acquisition
 * shares one in-flight signing, and forced re-signs after an ASC 401 are
 * merged by the rejected token so a burst of 401s cannot trigger a signing
 * storm (or worse, invalidate a token that was already replaced).
 */
export class AscTokenProvider {
  readonly #credentials: AscCredentials;
  readonly #clock: () => number;
  readonly #sign: SignFunction;
  #current: SignedToken | null = null;
  #inflight: Promise<SignedToken> | null = null;
  #forced: { staleToken: string; promise: Promise<SignedToken> } | null = null;

  constructor(credentials: AscCredentials, options: TokenProviderOptions = {}) {
    this.#credentials = credentials;
    this.#clock = options.clock ?? Date.now;
    this.#sign = options.sign ?? signAscToken;
  }

  /** Returns a token with at least `REFRESH_SAFETY_MARGIN_SECONDS` remaining. */
  async getToken(): Promise<string> {
    if (this.#current !== null && this.#hasSafeLifetime(this.#current)) {
      return this.#current.token;
    }
    const signed = await (this.#inflight ?? this.#startSigning());
    return signed.token;
  }

  /**
   * Forced re-sign after ASC rejected `staleToken` with a 401. If the current
   * token already differs, the rejection was raced by a refresh and the
   * current token is returned without signing — re-signing here would discard
   * a perfectly fresh token and invite a second spurious 401 round.
   */
  async invalidate(staleToken: string): Promise<string> {
    if (this.#current !== null && this.#current.token !== staleToken) {
      return this.#current.token;
    }
    if (this.#forced !== null && this.#forced.staleToken === staleToken) {
      return (await this.#forced.promise).token;
    }

    this.#current = null;
    // Any signing already in flight will produce a token newer than the
    // rejected one, so it doubles as the forced re-sign.
    const promise = this.#inflight ?? this.#startSigning();
    this.#forced = { staleToken, promise };
    try {
      return (await promise).token;
    } finally {
      if (this.#forced.promise === promise) {
        this.#forced = null;
      }
    }
  }

  #hasSafeLifetime(signed: SignedToken): boolean {
    return (
      signed.expiresAtMs - this.#clock() > REFRESH_SAFETY_MARGIN_SECONDS * 1000
    );
  }

  #startSigning(): Promise<SignedToken> {
    const promise = this.#sign(this.#credentials, this.#clock())
      .then((signed) => {
        this.#current = signed;
        return signed;
      })
      .finally(() => {
        // A rejected signing must not be cached: clearing on settle lets the
        // next caller retry instead of awaiting a poisoned promise forever.
        if (this.#inflight === promise) {
          this.#inflight = null;
        }
      });
    this.#inflight = promise;
    return promise;
  }
}
