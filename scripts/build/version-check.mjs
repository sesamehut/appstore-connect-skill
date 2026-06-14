// Version consistency gate (in-repo arms only). The single authoritative source
// is package.json.version; the CLI hardcodes its own CLI_VERSION (fed to
// `--version` and the bundle, where there is no package.json to read at
// runtime), so the two can silently drift across a release. This asserts they
// agree and exits non-zero with a clear diff if they do not.
//
// Scope per the M8 design: the plugin.json arm is generated at packaging time
// and the marketplace-entry arm lives in a sibling repo (plugins-marketplace)
// that CI cannot read, so those are pre-publish gates handled later — this
// script deliberately reads nothing outside this repo. It is wired into
// `npm run check`.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");

const packageJson = JSON.parse(
  await readFile(path.join(repoRoot, "package.json"), "utf8"),
);
const packageVersion = packageJson.version;

const rootSource = await readFile(
  path.join(repoRoot, "src", "cli", "root.ts"),
  "utf8",
);
const match = /export const CLI_VERSION = "([^"]+)";/.exec(rootSource);
if (match === null) {
  console.error(
    'Could not find `export const CLI_VERSION = "...";` in src/cli/root.ts.',
  );
  process.exit(1);
}
const cliVersion = match[1];

const sources = [
  { name: "package.json version", value: packageVersion },
  { name: "src/cli/root.ts CLI_VERSION", value: cliVersion },
];

const unique = new Set(sources.map((source) => source.value));
if (unique.size !== 1) {
  console.error("Version mismatch across in-repo sources:");
  for (const source of sources) {
    console.error(`  ${source.name}: ${source.value}`);
  }
  console.error(
    "Fix: set package.json version and CLI_VERSION (src/cli/root.ts) to the same value.",
  );
  process.exit(1);
}

console.log(
  `Version consistent: ${packageVersion} (package.json, CLI_VERSION)`,
);
