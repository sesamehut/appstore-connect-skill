import { existsSync } from "node:fs";
import { FETCH_MANIFEST_PATH, MANIFEST_PATH, fail, readJson } from "./lib.mjs";

if (!existsSync(FETCH_MANIFEST_PATH)) {
  fail(
    `No fetch record at ${FETCH_MANIFEST_PATH}. Run \`npm run contract:drift\` (which fetches first).`,
  );
}
if (!existsSync(MANIFEST_PATH)) {
  fail(
    `No committed manifest at ${MANIFEST_PATH}. Run \`npm run contract:update\`.`,
  );
}

const fetched = await readJson(FETCH_MANIFEST_PATH);
const committed = await readJson(MANIFEST_PATH);

if (fetched.sha256 === committed.spec.sha256) {
  console.log(
    `No drift: Apple still publishes spec ${committed.spec.version} (sha256 ${committed.spec.sha256.slice(0, 12)}…).`,
  );
} else {
  fail(
    `Apple spec drifted: committed ${committed.spec.version} (sha256 ${committed.spec.sha256.slice(0, 12)}…) ` +
      `vs published ${fetched.specVersion} (sha256 ${fetched.sha256.slice(0, 12)}…).\n` +
      `Apple keeps no history — regenerate promptly: \`npm run contract:update\`, review the contract diff, then \`npm run check\`.`,
  );
}
