import type { ArgsDef } from "citty";

import type { ReadScope } from "../pagination/paginate.js";
import { CliUsageError } from "./exit-codes.js";

/**
 * Shared flags for every list command. citty 0.2 has no number arg type, so
 * numeric flags are declared as strings and validated here.
 */
export const readScopeArgs = {
  all: {
    type: "boolean",
    description:
      "Read every page (stops early near the rate-limit safety floor)",
  },
  "max-items": {
    type: "string",
    valueHint: "N",
    description: "Read at most N items across pages",
  },
  "page-limit": {
    type: "string",
    valueHint: "N",
    description: "Page size sent to ASC (server cap 200)",
  },
} as const satisfies ArgsDef;

// `| undefined` is explicit because citty's parsed args carry undefined as a
// value, which exactOptionalPropertyTypes keeps distinct from absence.
export interface ReadScopeFlags {
  readonly all?: boolean | undefined;
  readonly "max-items"?: string | undefined;
  readonly "page-limit"?: string | undefined;
}

/**
 * No flag means single-page: the cheapest read, kept honest by the envelope's
 * `truncated` marker. Reading more is always an explicit upgrade.
 */
export function resolveReadScope(flags: ReadScopeFlags): ReadScope {
  const maxItems = flags["max-items"];
  if (flags.all === true && maxItems !== undefined) {
    throw new CliUsageError(
      "--all and --max-items are mutually exclusive; pick one read scope.",
    );
  }
  if (flags.all === true) {
    return "all-pages";
  }
  if (maxItems !== undefined) {
    return { maxItems: parsePositiveInt(maxItems, "--max-items") };
  }
  return "single-page";
}

export function resolvePageLimit(flags: ReadScopeFlags): number | undefined {
  const raw = flags["page-limit"];
  return raw === undefined ? undefined : parsePositiveInt(raw, "--page-limit");
}

export function parsePositiveInt(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new CliUsageError(
      `${flag} expects a positive integer, got "${raw}".`,
    );
  }
  return value;
}

/** Splits a comma-separated flag value into the ASC list form. */
export function csvList(raw: string | undefined): string[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");
  return values.length === 0 ? undefined : values;
}
