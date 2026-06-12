import { defineCommand } from "citty";

import { cliContextOf } from "../context.js";
import { emitResult } from "../output.js";
import { API_UNSUPPORTED, DOMAINS } from "../registry.js";

export const capabilitiesCommand = defineCommand({
  meta: {
    name: "capabilities",
    description:
      "Print the authoritative map of implemented, planned, and API-unsupported tasks",
  },
  run(ctx) {
    const cli = cliContextOf(ctx.data);
    emitResult(cli.io, {
      ok: true,
      command: "capabilities",
      data: {
        implemented: DOMAINS.filter((entry) => entry.status.implemented).map(
          (entry) => ({ name: entry.name, summary: entry.summary }),
        ),
        planned: DOMAINS.filter((entry) => !entry.status.implemented).map(
          (entry) => ({
            name: entry.name,
            summary: entry.summary,
            milestone: entry.status.implemented
              ? undefined
              : entry.status.milestone,
          }),
        ),
        unsupportedByAppleApi: API_UNSUPPORTED,
      },
    });
  },
});
