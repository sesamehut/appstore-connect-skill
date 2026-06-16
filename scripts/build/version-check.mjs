// Version consistency gate (in-repo arms only). The single authoritative source
// is package.json.version; the CLI hardcodes its own CLI_VERSION (fed to
// `--version` and the bundle, where there is no package.json to read at
// runtime), so the two can silently drift across a release. This asserts they
// agree and exits non-zero with a clear diff if they do not.
//
// Scope: package.json, CLI_VERSION, and the committed plugin/.claude-plugin/
// plugin.json all live in this repo, so this gate enforces all three in
// `npm run check`. The marketplace-entry arm lives in a sibling repo
// (plugins-marketplace) that CI cannot read, so it stays a pre-publish gate.

import { existsSync } from "node:fs";
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

// The committed plugin payload's plugin.json now lives in this repo, so its
// version is enforced here too: bumping the version without re-running
// `npm run package:plugin` (which regenerates plugin.json from package.json)
// would publish a stale plugin, and this gate catches that drift.
const pluginJsonPath = path.join(
  repoRoot,
  "plugin",
  ".claude-plugin",
  "plugin.json",
);
if (!existsSync(pluginJsonPath)) {
  console.error(
    "Missing plugin/.claude-plugin/plugin.json. Run `npm run package:plugin` to generate the committed plugin payload.",
  );
  process.exit(1);
}
const pluginJson = JSON.parse(await readFile(pluginJsonPath, "utf8"));

const sources = [
  { name: "package.json version", value: packageVersion },
  { name: "src/cli/root.ts CLI_VERSION", value: cliVersion },
  {
    name: "plugin/.claude-plugin/plugin.json version",
    value: pluginJson.version,
  },
];

const unique = new Set(sources.map((source) => source.value));
if (unique.size !== 1) {
  console.error("Version mismatch across in-repo sources:");
  for (const source of sources) {
    console.error(`  ${source.name}: ${source.value}`);
  }
  console.error(
    "Fix: set package.json version and CLI_VERSION (src/cli/root.ts) to the same value, then re-run `npm run package:plugin` to refresh plugin.json.",
  );
  process.exit(1);
}

console.log(
  `Version consistent: ${packageVersion} (package.json, CLI_VERSION, plugin.json)`,
);
