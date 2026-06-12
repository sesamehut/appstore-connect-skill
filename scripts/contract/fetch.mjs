import { mkdir, writeFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import {
  CACHE_DIR,
  CACHED_SPEC_PATH,
  FETCH_MANIFEST_PATH,
  SPEC_SOURCE_URL,
  fail,
  sha256,
  writeJson,
} from "./lib.mjs";

const response = await fetch(SPEC_SOURCE_URL);
if (!response.ok) {
  fail(
    `Spec download failed: HTTP ${response.status} ${response.statusText} for ${SPEC_SOURCE_URL}`,
  );
}
const zipBytes = new Uint8Array(await response.arrayBuffer());

// Apple's zip carries macOS resource-fork noise (__MACOSX/, ._* AppleDouble
// entries) next to the spec, so match on the exact basename.
const entries = unzipSync(zipBytes, {
  filter: (file) =>
    file.name.split("/").at(-1) === "openapi.oas.json" &&
    !file.name.startsWith("__MACOSX/"),
});

const entryNames = Object.keys(entries);
if (entryNames.length !== 1) {
  fail(
    `Expected exactly one openapi.oas.json in the spec zip, found ${String(entryNames.length)}: ${entryNames.join(", ")}`,
  );
}
const specBytes = entries[entryNames[0]];

let spec;
try {
  spec = JSON.parse(new TextDecoder().decode(specBytes));
} catch (error) {
  fail(`Downloaded spec is not valid JSON: ${String(error)}`);
}

await mkdir(CACHE_DIR, { recursive: true });
await writeFile(CACHED_SPEC_PATH, specBytes);
const specSha256 = sha256(specBytes);
await writeJson(FETCH_MANIFEST_PATH, {
  sourceUrl: SPEC_SOURCE_URL,
  fetchedAt: new Date().toISOString(),
  specTitle: spec.info?.title,
  specVersion: spec.info?.version,
  openapiVersion: spec.openapi,
  sha256: specSha256,
});

console.log(
  `Fetched ${spec.info?.title ?? "spec"} ${spec.info?.version ?? "?"} ` +
    `(OpenAPI ${spec.openapi ?? "?"}, ${String(specBytes.length)} bytes, sha256 ${specSha256.slice(0, 12)}…) ` +
    `into ${CACHED_SPEC_PATH}`,
);
