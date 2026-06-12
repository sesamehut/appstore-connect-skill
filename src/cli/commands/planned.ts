import { defineCommand } from "citty";
import type { CommandDef } from "citty";

import { NotImplementedError } from "../exit-codes.js";
import type { DomainEntry } from "../registry.js";

/**
 * A visible stub for a planned domain: it appears in --help, accepts any
 * trailing arguments (so `asc reports download x` lands here instead of an
 * unknown-command error), and answers with the planned milestone — exit 5,
 * distinct from "Apple's API cannot do this".
 */
export function makePlannedCommand(entry: DomainEntry): CommandDef {
  if (entry.status.implemented) {
    throw new Error(`'${entry.name}' is implemented; no stub belongs here.`);
  }
  const { milestone } = entry.status;
  return defineCommand({
    meta: {
      name: entry.name,
      description: `(not yet implemented — planned for ${milestone}) ${entry.summary}`,
    },
    run() {
      throw new NotImplementedError(entry.name, milestone);
    },
  });
}
