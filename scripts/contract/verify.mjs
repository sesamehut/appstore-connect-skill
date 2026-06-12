import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  ARTIFACT_PATH,
  MANIFEST_PATH,
  fail,
  installedGeneratorVersion,
  readJson,
  sha256,
} from "./lib.mjs";

if (!existsSync(ARTIFACT_PATH) || !existsSync(MANIFEST_PATH)) {
  fail(
    `Missing ${ARTIFACT_PATH} or ${MANIFEST_PATH}. Run \`npm run contract:update\` to generate the contract.`,
  );
}

const manifest = await readJson(MANIFEST_PATH);
const problems = [];

const REQUIRED_FIELDS = [
  ["spec", "title"],
  ["spec", "version"],
  ["spec", "openapiVersion"],
  ["spec", "sourceUrl"],
  ["spec", "fetchedAt"],
  ["spec", "sha256"],
  ["generator", "name"],
  ["generator", "version"],
  ["output", "file"],
  ["output", "sha256"],
];
for (const [group, field] of REQUIRED_FIELDS) {
  if (!manifest[group]?.[field]) {
    problems.push(`Manifest is missing ${group}.${field}.`);
  }
}

if (manifest.output?.file && manifest.output.file !== ARTIFACT_PATH) {
  problems.push(
    `Manifest points at ${manifest.output.file} but the artifact of record is ${ARTIFACT_PATH}.`,
  );
}

const artifactSha256 = sha256(await readFile(ARTIFACT_PATH));
if (manifest.output?.sha256 && artifactSha256 !== manifest.output.sha256) {
  problems.push(
    `${ARTIFACT_PATH} does not match the manifest hash — the generated contract was edited by hand or the manifest is stale.`,
  );
}

// A generator upgrade must regenerate the contract in the same change, so
// that the committed artifact never silently disagrees with the toolchain
// that claims to have produced it.
const installed = installedGeneratorVersion();
if (manifest.generator?.version && manifest.generator.version !== installed) {
  problems.push(
    `Generator version drift: manifest records ${manifest.generator.version}, installed is ${installed}.`,
  );
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  fail(`Contract verification failed. Fix with \`npm run contract:update\`.`);
}

console.log(
  `Contract verified: ${ARTIFACT_PATH} matches manifest (spec ${manifest.spec.version}, sha256 ${artifactSha256.slice(0, 12)}…)`,
);
