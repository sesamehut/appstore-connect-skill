import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

// Apple publishes only the latest spec, as a zip wrapping a single JSON file.
// There is no versioned or historical download; drift detection has to poll
// this one URL.
export const SPEC_SOURCE_URL =
  "https://developer.apple.com/sample-code/app-store-connect/app-store-connect-openapi-specification.zip";

export const CACHE_DIR = path.join(".cache", "asc-spec");
export const CACHED_SPEC_PATH = path.join(CACHE_DIR, "openapi.oas.json");
export const FETCH_MANIFEST_PATH = path.join(CACHE_DIR, "fetch.json");

// Forward slashes so the manifest records the same path on every platform.
export const ARTIFACT_PATH = "src/generated/asc-openapi.ts";
export const MANIFEST_PATH = "src/generated/asc-openapi.manifest.json";

export const GENERATOR_NAME = "openapi-typescript";

export function installedGeneratorVersion() {
  const require = createRequire(import.meta.url);
  return require(`${GENERATOR_NAME}/package.json`).version;
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function fail(message) {
  console.error(message);
  process.exit(1);
}
