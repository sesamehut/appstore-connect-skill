// Renders the committed dev SKILL.md from the single-source template. The plugin
// variant is never written here — it is rendered into the plugin payload at
// packaging time (and asserted in memory by skill:verify); committing it would
// add a second on-disk file whose ${CLAUDE_PLUGIN_ROOT} paths are meaningless in
// the development checkout.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { DEV_SKILL_PATH, fail, readTemplate, render } from "./lib.mjs";

const profileArg = process.argv[2] ?? "dev";
if (profileArg !== "dev") {
  fail(
    `skill:generate only writes the dev profile (got "${profileArg}"); the plugin profile is rendered at packaging time.`,
  );
}

const template = await readTemplate();
const rendered = render(template, "dev");

await mkdir(path.dirname(DEV_SKILL_PATH), { recursive: true });
await writeFile(DEV_SKILL_PATH, rendered);

const lineCount = rendered.split("\n").length;
console.log(
  `Wrote ${DEV_SKILL_PATH} (${String(Buffer.byteLength(rendered, "utf8"))} bytes, ${String(lineCount)} lines) from the dev profile.`,
);
