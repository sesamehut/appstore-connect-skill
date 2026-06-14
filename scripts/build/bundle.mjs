// Distribution-time bundler: inlines the CLI plus its three runtime deps
// (jose / openapi-fetch / citty) into one self-contained ESM file `asc.mjs`
// that runs on Node alone — no node_modules, no install step. esbuild is a
// build-time devDependency only; it never enters `dependencies` and the bundle
// it produces carries no dependency references at all.
//
// Determinism mirrors the contract layer: the esbuild version is pinned in
// package.json, output is NOT minified (must stay human-auditable per the M8
// design), and re-running on unchanged source must yield a byte-identical
// `asc.mjs`. WHY platform "node": jose's conditional exports must resolve the
// Node/WebCrypto path, not the browser path, or ES256 signing breaks.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const entryPoint = path.join(repoRoot, "dist", "cli", "index.js");
const outDir = path.join(repoRoot, "dist", "bundle");
const outFile = path.join(outDir, "asc.mjs");

// Bundle from the tsc-built CLI entry (dist/cli/index.js), not src/cli/index.ts:
// this keeps a single transpilation path — tsc, the same compiler the audited
// dev build and tests use — so the bundle is dev semantics with deps inlined,
// never a second esbuild TS-transpile that could diverge.
const packageJson = JSON.parse(
  await readFile(path.join(repoRoot, "package.json"), "utf8"),
);
const pinnedEsbuild = packageJson.devDependencies?.esbuild;

await mkdir(outDir, { recursive: true });

const result = await build({
  entryPoints: [entryPoint],
  bundle: true,
  platform: "node",
  format: "esm",
  // Matches package.json engines (Node >= 22.12); 22.12 is the lowest LTS that
  // ships the import-attributes / WebCrypto surface the runtime relies on.
  target: ["node22.12"],
  minify: false,
  outfile: outFile,
  metafile: true,
  // Replaced with the literal `true` so doctor's dependency/build checks
  // self-report as a bundle instead of probing a node_modules that is not there
  // (see src/cli/preflight.ts isBundled()).
  define: {
    __ASC_BUNDLED__: "true",
  },
  // The entry's `#!/usr/bin/env node` shebang is preserved by esbuild at the
  // top of the bundle, so both `node asc.mjs` and `./asc.mjs` work.
  legalComments: "inline",
  logLevel: "warning",
});

const bytes = await readFile(outFile);

console.log(
  `Bundled ${path.relative(repoRoot, entryPoint)} -> ${path.relative(
    repoRoot,
    outFile,
  )} (${String(bytes.length)} bytes) with esbuild ${pinnedEsbuild}`,
);

if (result.warnings.length > 0) {
  for (const warning of result.warnings) {
    console.warn(warning.text);
  }
}

// Guard the contract the design promises: the produced file must be runnable
// on Node alone (shebang at the top) with the deps actually inlined.
const text = bytes.toString("utf8");
const problems = [];
if (!text.startsWith("#!/usr/bin/env node")) {
  problems.push(
    "asc.mjs is missing the leading `#!/usr/bin/env node` shebang.",
  );
}
for (const dep of ["jose", "openapi-fetch", "citty"]) {
  if (text.includes(`from "${dep}"`) || text.includes(`require("${dep}")`)) {
    problems.push(`asc.mjs still references the external dependency "${dep}".`);
  }
}
if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

// Write a copy of the shebang-bearing file with the executable bit set so
// `./asc.mjs` works on POSIX; on Windows this is a no-op but harmless.
await writeFile(outFile, bytes, { mode: 0o755 });
