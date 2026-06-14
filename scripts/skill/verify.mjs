// Offline fail-closed gate for the single-source SKILL.md, mirroring
// scripts/contract/verify.mjs. It guards BOTH variants so "dev and plugin never
// drift" is provable in both directions:
//
//   1. The committed dev SKILL.md is byte-equal (after LF-normalize) to the
//      template rendered with the dev profile — any hand-edit to the committed
//      file without re-running skill:generate, or a template change that was not
//      regenerated, fails here.
//   2. The plugin profile, rendered in memory (it is never committed; it ships
//      in the plugin payload at packaging time), has no leftover placeholder
//      tokens, addresses the bundle via ${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs, never
//      references dist/cli/index.js, and shares an identical body with dev.
//
// Any missing template / missing committed file / mismatch exits non-zero.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import {
  DEV_SKILL_PATH,
  PLACEHOLDERS,
  TEMPLATE_PATH,
  fail,
  normalizeLf,
  render,
} from "./lib.mjs";

if (!existsSync(TEMPLATE_PATH)) {
  fail(
    `Missing SKILL template at ${TEMPLATE_PATH}. The single source for SKILL.md is gone.`,
  );
}
if (!existsSync(DEV_SKILL_PATH)) {
  fail(
    `Missing committed dev SKILL.md at ${DEV_SKILL_PATH}. Run \`npm run skill:generate\`.`,
  );
}

const template = normalizeLf(await readFile(TEMPLATE_PATH, "utf8"));
const problems = [];

// (1) Committed dev SKILL.md must equal the dev render, byte for byte (LF).
const devRendered = render(template, "dev");
const devCommitted = normalizeLf(await readFile(DEV_SKILL_PATH, "utf8"));
if (devCommitted !== devRendered) {
  problems.push(
    `Committed dev SKILL.md does not match the template's dev render — it was hand-edited or the template changed without regenerating. Fix with \`npm run skill:generate\`.`,
  );
}

// (2) Plugin profile rendered in memory.
const pluginRendered = render(template, "plugin");

for (const token of PLACEHOLDERS) {
  if (pluginRendered.includes(token)) {
    problems.push(
      `Plugin render still contains unfilled placeholder ${token}.`,
    );
  }
}
if (!pluginRendered.includes("${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs")) {
  problems.push(
    "Plugin render does not address the bundle via ${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs.",
  );
}
if (pluginRendered.includes("dist/cli/index.js")) {
  problems.push(
    "Plugin render references dist/cli/index.js, a development-only path that must never reach the shipped plugin.",
  );
}

// Shared-body equality: collapse each variant's two rendered regions back to the
// neutral placeholder tokens, then compare. Whatever survives is the body both
// variants share verbatim; if it differs, the body drifted between variants.
function collapseToBody(rendered, profile) {
  let body = rendered;
  for (const token of PLACEHOLDERS) {
    const value = render(`${token}`, profile);
    body = body.split(value).join(token);
  }
  return body;
}
const devBody = collapseToBody(devRendered, "dev");
const pluginBody = collapseToBody(pluginRendered, "plugin");
if (devBody !== pluginBody) {
  problems.push(
    "The shared body differs between the dev and plugin renders — the two variants have drifted outside their two designated regions.",
  );
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  fail("SKILL.md verification failed.");
}

console.log(
  `SKILL.md verified: committed dev matches the dev render and the plugin render is well-formed (shared body identical across both variants).`,
);
