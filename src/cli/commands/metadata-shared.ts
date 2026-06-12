import { readFile } from "node:fs/promises";

import type { ArgsDef } from "citty";

import { AscNotFoundError } from "../../errors.js";
import { CliUsageError } from "../exit-codes.js";

/** One writable attribute: its CLI flag and its ASC attribute name. */
export interface AttributeSpec {
  readonly flag: string;
  readonly attribute: string;
  readonly description: string;
}

export function attributeArgs(specs: readonly AttributeSpec[]): ArgsDef {
  const args: Record<string, { type: "string"; description: string }> = {};
  for (const spec of specs) {
    args[spec.flag] = { type: "string", description: spec.description };
  }
  return args;
}

export const fromJsonArg = {
  "from-json": {
    type: "string",
    valueHint: "file.json",
    description:
      "JSON file of attributes (camelCase keys; null clears a field); explicit flags override it",
  },
} as const satisfies ArgsDef;

/**
 * Merges --from-json content with explicit flags (flags win). Flags can only
 * set strings; clearing a field (null) is expressible through the JSON file.
 */
export async function collectAttributes(
  args: Readonly<Record<string, unknown>>,
  specs: readonly AttributeSpec[],
  options: { readonly allowEmpty?: boolean } = {},
): Promise<Record<string, string | null>> {
  const attributes: Record<string, string | null> = {};

  const fromJsonPath = args["from-json"];
  if (typeof fromJsonPath === "string") {
    Object.assign(attributes, await readAttributeFile(fromJsonPath, specs));
  }
  for (const spec of specs) {
    const value = args[spec.flag];
    if (typeof value === "string") {
      attributes[spec.attribute] = value;
    }
  }

  if (Object.keys(attributes).length === 0 && options.allowEmpty !== true) {
    throw new CliUsageError(
      `Nothing to write: pass at least one field flag (${specs
        .map((spec) => `--${spec.flag}`)
        .join(", ")}) or --from-json.`,
    );
  }
  return attributes;
}

async function readAttributeFile(
  path: string,
  specs: readonly AttributeSpec[],
): Promise<Record<string, string | null>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new CliUsageError(`Cannot read the --from-json file at "${path}".`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CliUsageError(
      `The --from-json file "${path}" is not valid JSON.`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CliUsageError(
      `The --from-json file "${path}" must contain a JSON object of attributes.`,
    );
  }

  const allowed = new Map(specs.map((spec) => [spec.attribute, spec]));
  const attributes: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (!allowed.has(key)) {
      throw new CliUsageError(
        `Unknown attribute "${key}" in "${path}"; allowed: ${[...allowed.keys()].join(", ")}.`,
      );
    }
    if (value !== null && typeof value !== "string") {
      throw new CliUsageError(
        `Attribute "${key}" in "${path}" must be a string or null (null clears the field).`,
      );
    }
    attributes[key] = value;
  }
  return attributes;
}

/**
 * Picks the localization matching a locale out of a full listing. Raising
 * not-found (exit-code 3 semantics) keeps "the locale is absent" on the same
 * channel as ASC's own not-found, with the visible locales as the hint.
 */
export function requireLocaleMatch<
  T extends { readonly id: string; readonly attributes?: { locale?: string } },
>(items: readonly T[], locale: string, addCommand: string): T {
  const match = items.find((item) => item.attributes?.locale === locale);
  if (match !== undefined) {
    return match;
  }
  const visible = items
    .map((item) => item.attributes?.locale)
    .filter((value): value is string => value !== undefined);
  throw new AscNotFoundError(
    `No '${locale}' localization exists (visible locales: ${
      visible.length > 0 ? visible.join(", ") : "none"
    }). Add it with '${addCommand}'.`,
  );
}
