import { loadAscCredentialsFromEnv } from "../auth/credentials.js";
import { createAscClient } from "../http/client.js";
import type { AscClient } from "../http/client.js";
import type { RateLimitSnapshot } from "../http/rate-limit.js";

/** Output channels, injected so tests drive the CLI in-process. */
export interface CliIo {
  /** Machine-readable results only (the JSON envelope). */
  readonly out: (text: string) => void;
  /** Human/agent diagnostics: errors, hints, progress. */
  readonly err: (text: string) => void;
}

export interface CliContext {
  readonly io: CliIo;
  readonly env: Readonly<Record<string, string | undefined>>;
  /**
   * Lazily creates (then reuses) the ASC client, so credential-free commands
   * (doctor, capabilities, --help) never touch the environment.
   */
  readonly client: () => Promise<AscClient>;
  /** Latest quota snapshot observed on any response this invocation. */
  readonly lastRateLimit: () => RateLimitSnapshot | undefined;
}

export function createCliContext(
  io: CliIo,
  env: Readonly<Record<string, string | undefined>>,
): CliContext {
  let clientPromise: Promise<AscClient> | undefined;
  let lastSnapshot: RateLimitSnapshot | undefined;

  return {
    io,
    env,
    client: () => {
      clientPromise ??= loadAscCredentialsFromEnv(env).then((credentials) =>
        createAscClient({
          credentials,
          onRateLimit: (snapshot) => {
            lastSnapshot = snapshot;
          },
        }),
      );
      return clientPromise;
    },
    lastRateLimit: () => lastSnapshot,
  };
}

/** The typed view of citty's untyped `data` slot. */
export function cliContextOf(data: unknown): CliContext {
  return data as CliContext;
}
