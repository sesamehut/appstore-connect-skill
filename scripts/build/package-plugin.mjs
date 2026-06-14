// Assemble the FULL Claude Code plugin payload into a gitignored staging dir
// (dist/plugin/) from a single source, then secret-scan it fail-closed.
//
// CRITICAL: assembly is an EXPLICIT ALLOW-LIST — every output file is generated
// or read by name here. It NEVER globs or recursively copies the repo root,
// because the repo root physically holds a real AuthKey_*.p8 and .env.local
// (both gitignored but on disk). A recursive copy would sweep those credentials
// into the public plugin repo; enumerating the few files is the structural fix.
//
// The secret-scan is the mechanical backstop: even if assembly ever regressed,
// a credential marker in the staging tree aborts packaging with a non-zero exit
// so nothing can be published.

import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  PLUGIN_NAME,
  buildPluginJson,
  buildReadme,
  PLUGIN_CLAUDE_MD,
  PLUGIN_GITIGNORE,
  repoRoot,
  scanForSecrets,
} from "./plugin-payload.mjs";
import { readTemplate, render } from "../skill/lib.mjs";

const stagingDir = path.join(repoRoot, "dist", "plugin");
const bundleSource = path.join(repoRoot, "dist", "bundle", "asc.mjs");

function run(commandLine) {
  // shell:true with a single command string (not array args) is the
  // non-deprecated spawn form; the shell resolves npm.cmd on Windows. inherit
  // stdio so the wrapped step's own logging surfaces in this script's output.
  const result = spawnSync(commandLine, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    console.error(
      `\`${commandLine}\` failed with exit code ${String(result.status)}.`,
    );
    process.exit(result.status === null ? 1 : result.status);
  }
}

// 1. Produce the self-contained CLI bundle (build + esbuild). `npm run bundle`
//    already chains `npm run build`, so the bundle reflects current source.
console.log("Building the self-contained CLI bundle...");
run("npm run bundle");

// 2. Render the plugin-profile SKILL.md in memory (never committed in the dev
//    repo; it only exists inside the payload).
const template = await readTemplate();
const pluginSkill = render(template, "plugin");
if (pluginSkill.includes("{{")) {
  console.error(
    "Rendered plugin SKILL.md still contains an unfilled placeholder.",
  );
  process.exit(1);
}

// 3. Assemble into a clean staging dir. Wipe first so a removed file in a later
//    release cannot linger from a prior run (deterministic, repeatable output).
await rm(stagingDir, { recursive: true, force: true });
await mkdir(path.join(stagingDir, ".claude-plugin"), { recursive: true });
await mkdir(path.join(stagingDir, "skills", PLUGIN_NAME), { recursive: true });
await mkdir(path.join(stagingDir, "cli"), { recursive: true });

const pluginJson = await buildPluginJson();
const readme = await buildReadme();
const bundleBytes = await readFile(bundleSource);

// EXPLICIT ALLOW-LIST: the only files written into the staging tree.
const written = [
  [
    path.join(stagingDir, ".claude-plugin", "plugin.json"),
    `${JSON.stringify(pluginJson, null, 2)}\n`,
  ],
  [path.join(stagingDir, "skills", PLUGIN_NAME, "SKILL.md"), pluginSkill],
  // Bundle copied as raw bytes (it carries a shebang); mode 0o755 so ./asc.mjs
  // is executable on POSIX, harmless on Windows.
  [path.join(stagingDir, "cli", "asc.mjs"), bundleBytes, { mode: 0o755 }],
  [path.join(stagingDir, "README.md"), readme],
  [path.join(stagingDir, "CLAUDE.md"), PLUGIN_CLAUDE_MD],
  [path.join(stagingDir, ".gitignore"), PLUGIN_GITIGNORE],
];

for (const [filePath, content, options] of written) {
  await writeFile(filePath, content, options);
}

console.log(`Assembled ${String(written.length)} files into ${stagingDir}:`);
for (const [filePath] of written) {
  console.log(`  ${path.relative(repoRoot, filePath)}`);
}

// 4. Secret-scan the ENTIRE staging tree, fail-closed (shared logic in
//    plugin-payload.mjs so the negative test exercises the same detection):
//    a forbidden filename or a complete PEM private-key block aborts packaging
//    with a non-zero exit so a leak can never be published.
const { hits, scanned } = await scanForSecrets(stagingDir);

if (hits.length > 0) {
  console.error(
    "Secret-scan FAILED — the staging payload contains credentials:",
  );
  for (const hit of hits) console.error(`  ${hit}`);
  console.error("Refusing to package. No credential may ship in the plugin.");
  process.exit(1);
}

console.log(
  `Secret-scan passed: ${String(scanned)} files scanned, no credential markers (filenames or PEM key blocks).`,
);
console.log(`Plugin payload ready at ${path.relative(repoRoot, stagingDir)}/`);
