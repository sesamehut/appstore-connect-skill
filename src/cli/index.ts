#!/usr/bin/env node
// Bootstrap guard: a bad environment must never surface as a bare stack
// trace. Nothing is imported before the Node version check, and main.js is
// loaded behind a guarded dynamic import so a missing or partial install
// turns into "what to run" instead of ERR_MODULE_NOT_FOUND noise.

// Mirrors MIN_NODE_VERSION in preflight.ts (which a unit test pins to
// package.json engines); inlined here because this file must not import
// anything before the check.
const MIN_NODE = [22, 12, 0] as const;

function nodeVersionSatisfied(): boolean {
  const parts = process.versions.node
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < MIN_NODE.length; index += 1) {
    const current = parts[index] ?? 0;
    const required = MIN_NODE[index] ?? 0;
    if (current !== required) {
      return current > required;
    }
  }
  return true;
}

if (!nodeVersionSatisfied()) {
  console.error(
    `error[preflight]: Node ${MIN_NODE.join(".")} or newer is required; found ${process.versions.node}.`,
  );
  console.error(
    "hint: install Node 24 LTS (or any release >= 22.12) and re-run.",
  );
  process.exitCode = 2;
} else {
  try {
    const { runCli } = await import("./main.js");
    process.exitCode = await runCli(process.argv.slice(2), {
      out: (text) => {
        console.log(text);
      },
      err: (text) => {
        console.error(text);
      },
    });
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === "ERR_MODULE_NOT_FOUND") {
      console.error(
        "error[preflight]: a required module could not be loaded; the install is missing or incomplete.",
      );
      console.error(
        "hint: run `npm ci` and `npm run build` in the repository root, then retry.",
      );
      process.exitCode = 2;
    } else {
      console.error(
        `error[unexpected]: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      process.exitCode = 1;
    }
  }
}
