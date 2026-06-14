// Single-source SKILL.md: the template is the one authority and both variants
// (dev / plugin) are rendered from it, so the shared body can never drift apart.
// Mirrors the contract layer's "generate + offline verify gate" discipline.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Forward slashes so any recorded path is identical on every platform.
export const TEMPLATE_PATH = path.join(here, "SKILL.template.md");

// The committed dev SKILL.md that Claude Code's project-level skill loads.
export const DEV_SKILL_PATH = path.resolve(
  here,
  "..",
  "..",
  ".claude",
  "skills",
  "app-store-connect",
  "SKILL.md",
);

// The two — and only two — regions that differ between variants. Anything else
// in the template is the shared body, rendered verbatim into both.
export const PLACEHOLDERS = ["{{CLI_INVOCATION}}", "{{SETUP_BLOCK}}"];

export const PROFILES = ["dev", "plugin"];

// Dev runs the tsc-built CLI straight from the development checkout, reached
// from the skill dir by three `../` hops; the bundle does not exist in dev.
const DEV_CLI_INVOCATION = [
  "```",
  'node "${CLAUDE_SKILL_DIR}/../../../dist/cli/index.js" <domain> <verb> [flags]',
  "```",
].join("\n");

// Plugin runs the shipped self-contained bundle from the installed plugin root.
const PLUGIN_CLI_INVOCATION = [
  "```",
  'node "${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs" <domain> <verb> [flags]',
  "```",
].join("\n");

// Dev must install deps and tsc-build before the CLI exists; both commands carry
// an explicit --prefix so the working directory never matters, then doctor.
const DEV_SETUP_BLOCK = [
  "Build once after install or after CLI changes (paths are explicit so the",
  "working directory never matters):",
  "",
  "```",
  'npm ci --prefix "${CLAUDE_SKILL_DIR}/../../.."',
  'npm run build --prefix "${CLAUDE_SKILL_DIR}/../../.."',
  'node "${CLAUDE_SKILL_DIR}/../../../dist/cli/index.js" doctor',
  "```",
].join("\n");

// Plugin ships the bundle ready to run: no install, no build — only doctor.
const PLUGIN_SETUP_BLOCK = [
  "The bundled CLI ships ready to run — there is no install or build step.",
  "Verify the environment once:",
  "",
  "```",
  'node "${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs" doctor',
  "```",
].join("\n");

const REPLACEMENTS = {
  dev: {
    "{{CLI_INVOCATION}}": DEV_CLI_INVOCATION,
    "{{SETUP_BLOCK}}": DEV_SETUP_BLOCK,
  },
  plugin: {
    "{{CLI_INVOCATION}}": PLUGIN_CLI_INVOCATION,
    "{{SETUP_BLOCK}}": PLUGIN_SETUP_BLOCK,
  },
};

// Normalize CRLF -> LF (this is a Windows repo) before any read/compare/write,
// exactly as scripts/contract/generate.mjs does, so the verify gate never
// misfires on a git autocrlf checkout.
export function normalizeLf(text) {
  return text.replace(/\r\n/g, "\n");
}

export async function readTemplate() {
  return normalizeLf(await readFile(TEMPLATE_PATH, "utf8"));
}

export function render(template, profile) {
  const replacements = REPLACEMENTS[profile];
  if (replacements === undefined) {
    throw new Error(
      `Unknown profile "${profile}"; expected one of ${PROFILES.join(", ")}.`,
    );
  }
  let out = template;
  for (const [token, value] of Object.entries(replacements)) {
    out = out.split(token).join(value);
  }
  return normalizeLf(out);
}

export function fail(message) {
  console.error(message);
  process.exit(1);
}
