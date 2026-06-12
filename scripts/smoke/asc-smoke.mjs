// Real-credential smoke check for the runtime layers: auth + request core
// (M2) and pagination + first read capabilities (M3). Loads ASC_* credentials
// from the environment, performs a handful of minimal reads against the real
// App Store Connect API, and prints non-sensitive diagnostics only.
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
  getApp,
  listApps,
  listAppStoreVersions,
  loadAscCredentialsFromEnv,
} from "../../dist/index.js";

/** @type {import("../../dist/index.js").RateLimitSnapshot | undefined} */
let lastSnapshot;

try {
  const credentials = await loadAscCredentialsFromEnv();
  console.log(`key form:    ${credentials.keyForm}`);
  console.log(`key id:      ...${credentials.keyId.slice(-4)} (last 4 chars)`);

  const client = createAscClient({
    credentials,
    onRateLimit: (snapshot) => {
      lastSnapshot = snapshot;
    },
  });

  // Step 1 — paginated app list. pageLimit 1 with maxItems 2 forces a real
  // cursor continuation on any account with two or more apps; fields[apps]
  // also exercises comma-joined query serialization against the real parser.
  const apps = await listApps(client, {
    scope: { maxItems: 2 },
    pageLimit: 1,
    fields: ["bundleId"],
  });
  console.log(
    `apps:        ${apps.items.length} read over ${apps.pagesRead} page(s)` +
      `${apps.total === undefined ? "" : ` (total visible to this key: ${apps.total})`}` +
      `${apps.truncated ? ", truncated by maxItems" : ""}`,
  );
  if (apps.pagesRead > 1) {
    console.log("pagination:  followed a real links.next cursor");
  } else {
    console.log(
      "pagination:  single page only (account has fewer than 2 apps); cursor following is covered by offline tests",
    );
  }

  const firstApp = apps.items[0];
  if (firstApp === undefined) {
    console.log("no apps visible to this key; skipping detail/version steps");
    console.log("smoke check passed");
    process.exit(0);
  }

  // Step 2 — app detail through the capability layer's path substitution.
  const detail = await getApp(client, firstApp.id, {
    fields: ["name", "bundleId"],
  });
  console.log(
    `app detail:  id ...${detail.data.id.slice(-4)}, attributes ${detail.data.attributes === undefined ? "missing" : "returned"}`,
  );

  // Step 3 — version list for that app. pageLimit 1 with maxItems 2 gives a
  // second chance to follow a real cursor: single-app accounts usually still
  // have more than one version.
  const versions = await listAppStoreVersions(client, firstApp.id, {
    scope: { maxItems: 2 },
    pageLimit: 1,
    fields: ["platform", "versionString", "appVersionState"],
  });
  const firstVersion = versions.items[0];
  console.log(
    `versions:    ${versions.items.length} read over ${versions.pagesRead} page(s)${versions.truncated ? " (more exist)" : ""}` +
      `${firstVersion === undefined ? "" : `; latest: ${firstVersion.attributes?.platform ?? "?"} ${firstVersion.attributes?.versionString ?? "?"} [${firstVersion.attributes?.appVersionState ?? "?"}]`}`,
  );
  if (versions.pagesRead > 1) {
    console.log("pagination:  followed a real links.next cursor on versions");
  }

  if (lastSnapshot !== undefined) {
    console.log(
      `rate limit:  ${lastSnapshot.remaining ?? "?"} of ${lastSnapshot.hourlyLimit ?? "?"} hourly requests remaining`,
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
    if (error.pagination !== undefined) {
      console.error(
        `pagination progress before the failure: ${error.pagination.pagesRead} page(s), ${error.pagination.itemsRead} item(s)`,
      );
    }
    process.exit(3);
  }
  console.error("unexpected failure:", error);
  process.exit(1);
}
