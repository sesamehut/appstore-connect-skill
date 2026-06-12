import type { AscErrorCategory } from "../errors.js";

/**
 * Exit codes partition by the agent's next action, not by error taxonomy:
 * finer discrimination is already machine-readable in the stderr
 * `error[<category>]` prefix. 0/1/2/3 keep parity with the smoke script;
 * 64 is BSD EX_USAGE.
 */
export const EXIT = {
  success: 0,
  unexpected: 1,
  configuration: 2,
  ascRequest: 3,
  rateLimit: 4,
  notImplemented: 5,
  unsupportedByApi: 6,
  usage: 64,
} as const;

export function mapAscErrorToExit(category: AscErrorCategory): number {
  switch (category) {
    case "credential":
      return EXIT.configuration;
    case "rate-limit":
      return EXIT.rateLimit;
    case "authentication":
    case "permission":
    case "not-found":
    case "invalid-parameter":
    case "upstream":
    case "network":
      return EXIT.ascRequest;
  }
}

/** Bad flags or flag combinations caught by our own validation. */
export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

/** A planned capability the project has not delivered yet. */
export class NotImplementedError extends Error {
  readonly milestone: string;

  constructor(domain: string, milestone: string) {
    super(
      `'${domain}' is not implemented in this project yet; it is planned for milestone ${milestone}.`,
    );
    this.name = "NotImplementedError";
    this.milestone = milestone;
  }
}

/** A task Apple's API does not support at all; the web UI is the only path. */
export class UnsupportedByApiError extends Error {
  readonly guidance: string;

  constructor(task: string, guidance: string) {
    super(`Apple's App Store Connect API does not support: ${task}.`);
    this.name = "UnsupportedByApiError";
    this.guidance = guidance;
  }
}

/**
 * citty's CLIError class is not exported; its instances are recognized by
 * name and the `code` field (EARG, E_UNKNOWN_COMMAND, ...).
 */
export function isCittyUsageError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    error.name === "CLIError" &&
    typeof (error as { code?: unknown }).code === "string"
  );
}
