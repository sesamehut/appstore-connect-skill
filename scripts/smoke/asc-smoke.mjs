// Real-credential smoke check for the M2 auth + request core. Loads ASC_*
// credentials from the environment, performs one minimal read against the
// real App Store Connect API, and prints non-sensitive diagnostics only.
//
// Deliberately outside `npm run check` and CI: it needs network access and
// real credentials, which never enter the repository. Run via `npm run smoke`
// (which builds dist/ first).
//
// Exit codes: 0 success, 2 credential/config error, 3 normalized ASC request
// error, 1 unexpected failure.

import {
  AscCredentialError,
  AscError,
  createAscClient,
  loadAscCredentialsFromEnv,
} from "../../dist/index.js";

/** @type {import("../../dist/index.js").RateLimitSnapshot | undefined} */
let lastSnapshot;

try {
  const credentials = await loadAscCredentialsFromEnv();
  console.log(`key form:   ${credentials.keyForm}`);
  console.log(`key id:     ...${credentials.keyId.slice(-4)} (last 4 chars)`);

  const client = createAscClient({
    credentials,
    onRateLimit: (snapshot) => {
      lastSnapshot = snapshot;
    },
  });

  // limit + fields[apps] also exercises the comma-joined query serialization
  // against the real ASC parser at zero extra request cost.
  const { data, response } = await client.GET("/v1/apps", {
    params: { query: { limit: 1, "fields[apps]": ["bundleId"] } },
  });

  console.log(`status:     ${response.status}`);
  const total = data?.meta?.paging?.total;
  console.log(
    `apps:       ${data?.data.length ?? 0} returned${total === undefined ? "" : ` (total visible to this key: ${total})`}`,
  );
  if (lastSnapshot !== undefined) {
    console.log(
      `rate limit: ${lastSnapshot.remaining ?? "?"} of ${lastSnapshot.hourlyLimit ?? "?"} hourly requests remaining`,
    );
  }
  console.log("smoke check passed");
} catch (error) {
  if (error instanceof AscCredentialError) {
    console.error(`credential error (${error.reason}): ${error.message}`);
    process.exit(2);
  }
  if (error instanceof AscError) {
    console.error(`${error.category} error: ${error.message}`);
    if (error.apiErrors.length > 0) {
      console.error(
        `asc error codes: ${error.apiErrors.map((item) => item.code).join(", ")}`,
      );
    }
    process.exit(3);
  }
  console.error("unexpected failure:", error);
  process.exit(1);
}
