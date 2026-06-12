import { defineCommand } from "citty";

import { cliContextOf } from "../context.js";
import { EXIT } from "../exit-codes.js";
import {
  checkBuild,
  checkCredentials,
  checkDependencies,
  checkNodeVersion,
} from "../preflight.js";

/**
 * Offline self-check: "what is missing and how to fix it". Deliberately makes
 * no network request — live verification belongs to `npm run smoke`.
 *
 * Returns the exit code through the context (main.ts owns process exit
 * semantics): 0 all green, 2 otherwise.
 */
export const doctorCommand = defineCommand({
  meta: {
    name: "doctor",
    description:
      "Check Node version, dependencies, build, and credential env vars (offline)",
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const checks = [
      checkNodeVersion(process.versions.node),
      await checkDependencies(),
      await checkBuild(),
      await checkCredentials(cli.env),
    ];
    const ok = checks.every((check) => check.status === "pass");

    cli.io.out(
      JSON.stringify({ ok, command: "doctor", data: { checks } }, null, 2),
    );
    for (const check of checks) {
      cli.io.err(
        `${check.status === "pass" ? "ok " : "FAIL"} ${check.name}: ${check.detail}`,
      );
      if (check.fix !== undefined) {
        cli.io.err(`     fix: ${check.fix}`);
      }
    }
    return ok ? EXIT.success : EXIT.configuration;
  },
});
