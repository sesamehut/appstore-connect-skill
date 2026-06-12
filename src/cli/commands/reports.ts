import { defineCommand } from "citty";
import type { CommandDef } from "citty";

import { NotImplementedError } from "../exit-codes.js";
import { reportsAnalyticsCommand } from "./reports-analytics.js";
import { reportsSalesCommand } from "./reports-sales.js";

/**
 * Transitional stub for a reports sub-domain still landing within M5: keeps
 * the planned-domain contract (visible in --help, any trailing args, exit 5)
 * at sub-domain granularity while the domain is built verb by verb.
 */
function plannedSubdomain(name: string, summary: string): CommandDef {
  return defineCommand({
    meta: {
      name,
      description: `(not yet implemented — planned for M5) ${summary}`,
    },
    run() {
      throw new NotImplementedError(`reports ${name}`, "M5");
    },
  });
}

export const reportsCommand = defineCommand({
  meta: {
    name: "reports",
    description: "Sales, finance, and analytics report workflows",
  },
  subCommands: {
    sales: reportsSalesCommand,
    finance: plannedSubdomain("finance", "Finance report downloads"),
    analytics: reportsAnalyticsCommand,
  },
});
