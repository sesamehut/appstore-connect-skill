import { defineCommand } from "citty";

import { listApps } from "../../capabilities/apps.js";
import { cliContextOf } from "../context.js";
import { emitResult } from "../output.js";

/**
 * `auth check`: the online counterpart to the offline `doctor`. It makes one
 * harmless read (a single page, a single app) to prove the credentials really
 * authenticate against ASC and that the key's role can read. Failures travel
 * the normal error funnel unchanged — a 401 surfaces as error[authentication]
 * (wrong key/issuer/private key, a revoked key, or a skewed clock) and a 403 as
 * error[permission] (the key's role is too narrow) — so this command only has
 * to shape the success report.
 */
const checkCommand = defineCommand({
  meta: {
    name: "check",
    description:
      "Verify credentials against the live ASC API with one harmless read (the online counterpart to doctor)",
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const credentials = await cli.credentials();
    const read = await listApps(await cli.client(), {
      scope: "single-page",
      pageLimit: 1,
    });
    emitResult(cli.io, {
      ok: true,
      command: "auth check",
      data: {
        authenticated: true,
        keyForm: credentials.keyForm,
        // Only the last four characters — never the full Key ID.
        keyId: `...${credentials.keyId.slice(-4)}`,
        // ASC's own estimate when the page reports it; otherwise fall back to
        // what this page already proves the key can see.
        appsVisible: read.total ?? read.items.length,
      },
      ...(read.rateLimit !== undefined && { rateLimit: read.rateLimit }),
    });
  },
});

export const authCommand = defineCommand({
  meta: {
    name: "auth",
    description: "Verify credentials against the live ASC API: check",
  },
  subCommands: {
    check: checkCommand,
  },
});
