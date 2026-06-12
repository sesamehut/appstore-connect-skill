import { expect } from "vitest";

import { loadAscCredentialsFromEnv } from "../../src/auth/credentials.js";
import { AscError } from "../../src/errors.js";
import type { AscApiErrorItem } from "../../src/errors.js";
import { createAscClient } from "../../src/http/client.js";
import type { AscClient } from "../../src/http/client.js";
import { makeTestKey } from "./test-credentials.js";

export const JSON_HEADERS = { "content-type": "application/json" };

/** A client over fresh fixture credentials; pair with useMockAgent(). */
export async function makeOfflineClient(): Promise<AscClient> {
  const key = await makeTestKey();
  const credentials = await loadAscCredentialsFromEnv(key.envTeam);
  return createAscClient({ credentials });
}

export function ascItem(overrides: Partial<AscApiErrorItem>): AscApiErrorItem {
  return {
    code: "ERROR",
    status: "400",
    title: "Error",
    detail: "Detail",
    ...overrides,
  };
}

export async function thrownBy(promise: Promise<unknown>): Promise<AscError> {
  const thrown = await promise.then(
    () => expect.fail("expected the call to throw"),
    (error: unknown) => error,
  );
  expect(thrown).toBeInstanceOf(AscError);
  return thrown as AscError;
}
