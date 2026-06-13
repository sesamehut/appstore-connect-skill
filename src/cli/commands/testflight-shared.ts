// Cross-subtree pieces shared by the testflight and builds command trees: the
// common flag fragments and the small helpers that translate citty args into
// capability/workflow inputs. Anything kind-specific (the recruitment-filter
// parser, the create-only rejection) lives in testflight-flags.ts; anything
// verb-specific stays in its command file. Precedent: media-shared.ts.

import type { ArgsDef } from "citty";

import { CliUsageError } from "../exit-codes.js";
import { csvList } from "../read-scope.js";

export const appArg = {
  app: {
    type: "string",
    required: true,
    valueHint: "appId",
    description: "The app's ASC id (from 'asc apps list')",
  },
} as const satisfies ArgsDef;

export const buildArg = {
  build: {
    type: "string",
    required: true,
    valueHint: "buildId",
    description: "The build's ASC id (from 'asc builds list')",
  },
} as const satisfies ArgsDef;

/**
 * The --force flag every destructive/irreversible verb requires. Its presence
 * is enforced per verb (a missing --force is a usage error raised before any
 * request); the description here is the single source of truth for the flag's
 * meaning across the tree.
 */
export const forceArg = {
  force: {
    type: "boolean",
    description: "Required to confirm this destructive or irreversible action",
  },
} as const satisfies ArgsDef;

/**
 * Reads a required id list from a comma-separated flag (e.g. `--testers a,b`).
 * Empty or missing fails as a usage error before any request, so a doomed
 * relationship edit never reaches ASC.
 */
export function requireIdList(
  raw: string | undefined,
  flag: string,
): readonly string[] {
  const ids = csvList(raw);
  if (ids === undefined || ids.length === 0) {
    throw new CliUsageError(
      `${flag} expects a comma-separated list of ids (got nothing).`,
    );
  }
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new CliUsageError(`${flag} lists "${id}" more than once.`);
    }
    seen.add(id);
  }
  return ids;
}

/** Asserts --force is present, with a verb-specific message; raised pre-request. */
export function requireForce(force: boolean | undefined, action: string): void {
  if (force !== true) {
    throw new CliUsageError(
      `${action} requires --force (this action is destructive or irreversible).`,
    );
  }
}
