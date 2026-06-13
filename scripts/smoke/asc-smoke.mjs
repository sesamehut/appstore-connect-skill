// Real-credential smoke check for the runtime layers: auth + request core
// (M2), pagination + first read capabilities (M3), the metadata/review read
// surface (M4), the report download flows (M5), and the media upload flow
// (M6). Loads ASC_* credentials from the environment, performs a handful of
// minimal reads against the real App Store Connect API, and prints
// non-sensitive diagnostics only.
//
// Setting ASC_VENDOR_NUMBER additionally smokes the sales and finance report
// downloads into a temp directory (cleaned up afterwards); a missing report
// or a finance-role 403 is a reported skip, not a failure — both exercise
// the diagnostics on purpose. The analytics read-only chain runs whenever an
// active report request exists and downloads at most one segment. Creating
// or deleting analytics report requests is deliberately NOT smoked: creation
// is one-time account setup (and starts Apple's 1-2 day first-data clock),
// deletion discards accumulated reports.
//
// Setting ASC_SMOKE_WRITE=1 additionally exercises the write path: it
// patches promotionalText on one version localization to a marker value,
// reads it back, and restores the original. promotionalText is the one copy
// field Apple lets you edit in any version state without triggering a new
// review submission, which is what makes the roundtrip safe and repeatable.
// The review-response write is deliberately NOT smoked: it publishes
// publicly attributed text, notifies the reviewer, and the upsert cannot be
// undone — offline body-assertion tests cover it; live verification is a
// supervised agent task.
//
// Setting ASC_SMOKE_MEDIA=1 additionally exercises the media upload flow on a
// throwaway screenshot: it generates a correctly-sized solid PNG at runtime,
// reserves + transfers (auth-free PUT) + commits it into an editable version's
// screenshot set, reads the processing status, and then deletes the asset (and
// the set if this run created it). Only an EDITABLE (non-live) version is
// touched, so the public store listing is never altered; if Apple's async
// processing reports FAILED on the generated image's dimensions, the upload
// mechanics are still verified and cleanup still runs. Previews are NOT smoked
// (video transcode takes minutes). Output masks everything to the asset id's
// last four characters plus state and byte counts — never the signed URL.
//
// Setting ASC_SMOKE_TESTFLIGHT=1 additionally exercises the TestFlight surface
// with REVERSIBLE / read-only steps only: it creates one empty beta group with
// a unique smoke name and deletes it in a finally block (cleaning up only the
// group this run created), reads beta groups, builds, and the crash/screenshot
// feedback collections (counts/metadata only — no PII downloaded, no signed
// URLs touched). Missing data or an insufficient role is a reported skip, not a
// failure (mirroring the report/media skip idiom). HIGH-SIDE-EFFECT writes are
// NEVER smoked: adding a tester emails real invitations, submitting a build for
// beta review triggers a real immutable Apple review, and expiring a build is
// irreversible — those have offline tests plus a one-time supervised walkthrough.
//
// Deliberately outside `npm run check` and CI: it needs network access and
// real credentials, which never enter the repository. Run via `npm run smoke`
// (which builds dist/ first).
//
// Exit codes: 0 success, 2 credential/config error, 3 normalized ASC request
// error, 1 unexpected failure.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

import {
  AscCredentialError,
  AscError,
  AscNotFoundError,
  AscPermissionError,
  createAscClient,
  createBetaGroup,
  deleteAppScreenshot,
  deleteAppScreenshotSet,
  deleteBetaGroup,
  downloadExternalFile,
  downloadFinanceReport,
  downloadSalesReport,
  ensureScreenshotSet,
  getApp,
  getAppStoreVersionLocalization,
  getScreenshotStatus,
  listAnalyticsReportInstances,
  listAnalyticsReportRequests,
  listAnalyticsReports,
  listAnalyticsReportSegments,
  listAppInfos,
  listApps,
  listAppStoreVersionLocalizations,
  listAppStoreVersions,
  listBetaGroups,
  listBuilds,
  listCrashFeedback,
  listCustomerReviewsForApp,
  listGroupTesters,
  listScreenshotFeedback,
  loadAscCredentialsFromEnv,
  updateAppStoreVersionLocalization,
  uploadScreenshot,
} from "../../dist/index.js";

/** @type {import("../../dist/index.js").RateLimitSnapshot | undefined} */
let lastSnapshot;

// The PNG CRC table the media check needs. Declared here, above the top-level
// `await` flow, because that flow can call solidColorPng (via runMediaCheck)
// before module evaluation would otherwise reach a later `const` — a const
// defined below the await would still be in its temporal dead zone at call time.
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

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
  // primaryLocale steers the write check's localization choice below.
  const detail = await getApp(client, firstApp.id, {
    fields: ["name", "bundleId", "primaryLocale"],
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

  // Step 4 — appInfos: the app-level metadata containers and their states.
  const infos = await listAppInfos(client, firstApp.id, {
    scope: "single-page",
    fields: ["state"],
  });
  console.log(
    `app infos:   ${infos.items.length} read; states: ${
      infos.items.map((info) => info.attributes?.state ?? "?").join(", ") ||
      "none"
    }`,
  );

  // Step 5 — version localizations (locales are public, non-sensitive data).
  if (firstVersion !== undefined) {
    const locales = await listAppStoreVersionLocalizations(
      client,
      firstVersion.id,
      { scope: "single-page", fields: ["locale"] },
    );
    console.log(
      `locales:     ${
        locales.items
          .map((localization) => localization.attributes?.locale ?? "?")
          .join(", ") || "none"
      } (version ${firstVersion.attributes?.versionString ?? "?"})`,
    );
  }

  // Step 6 — reviews: count only, no review text in the output.
  const reviews = await listCustomerReviewsForApp(client, firstApp.id, {
    scope: { maxItems: 1 },
    fields: ["rating"],
  });
  console.log(
    `reviews:     ${
      reviews.items.length === 0
        ? "none visible"
        : `present${reviews.total === undefined ? "" : ` (total: ${reviews.total})`}`
    }`,
  );

  // Steps 7-9 — report downloads (M5), all read-only on the ASC side.
  await runReportChecks(client, firstApp.id);

  // Step 10 — gated write roundtrip (see the header comment).
  if (process.env.ASC_SMOKE_WRITE === "1") {
    await runWriteCheck(client, detail.data);
  } else {
    console.log("write check: skipped (set ASC_SMOKE_WRITE=1 to enable)");
  }

  // Step 11 — gated media upload-then-delete (see the header comment).
  if (process.env.ASC_SMOKE_MEDIA === "1") {
    await runMediaCheck(client, detail.data);
  } else {
    console.log("media check: skipped (set ASC_SMOKE_MEDIA=1 to enable)");
  }

  // Step 12 — gated TestFlight reversible/read-only check (see header comment).
  if (process.env.ASC_SMOKE_TESTFLIGHT === "1") {
    await runTestflightCheck(client, firstApp.id);
  } else {
    console.log(
      "testflight:  skipped (set ASC_SMOKE_TESTFLIGHT=1 to enable read-only + create/delete-group steps)",
    );
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

/**
 * Sales, finance, and analytics report checks (M5), sharing one temp
 * directory that always gets cleaned up. Every "no data" outcome is a
 * reported skip: report availability depends on the account's history, not
 * on this codebase.
 *
 * @param {import("../../dist/index.js").AscClient} client
 * @param {string} appId
 */
async function runReportChecks(client, appId) {
  const dir = await mkdtemp(join(tmpdir(), "asc-smoke-reports-"));
  try {
    const vendorNumber = process.env.ASC_VENDOR_NUMBER;
    if (vendorNumber === undefined || vendorNumber === "") {
      console.log(
        "sales:       skipped (set ASC_VENDOR_NUMBER to smoke report downloads)",
      );
      console.log("finance:     skipped (ASC_VENDOR_NUMBER not set)");
    } else {
      await runSalesCheck(client, vendorNumber, dir);
      await runFinanceCheck(client, vendorNumber, dir);
    }
    await runAnalyticsReadChain(client, appId, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * @param {import("../../dist/index.js").AscClient} client
 * @param {string} vendorNumber
 * @param {string} dir
 */
async function runSalesCheck(client, vendorNumber, dir) {
  // ~3 days back: recent enough to exist, old enough to be finalized.
  const reportDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  try {
    const saved = await downloadSalesReport(
      client,
      {
        vendorNumber,
        reportType: "SALES",
        reportSubType: "SUMMARY",
        frequency: "DAILY",
        reportDate,
      },
      join(dir, "sales.tsv"),
    );
    console.log(
      `sales:       ${reportDate} ok — ${saved.rows} row(s), ${saved.bytesWritten} byte(s), ` +
        `${saved.wasGzipped ? "gzip" : "plain"} payload, ${saved.headers?.length ?? 0} column(s)`,
    );
  } catch (error) {
    if (error instanceof AscNotFoundError) {
      console.log(
        `sales:       no ${reportDate} DAILY report (enriched 404 verified; often just no activity that day)`,
      );
      return;
    }
    throw error;
  }
}

/**
 * @param {import("../../dist/index.js").AscClient} client
 * @param {string} vendorNumber
 * @param {string} dir
 */
async function runFinanceCheck(client, vendorNumber, dir) {
  // The previous calendar month approximates the latest closed fiscal month.
  const now = new Date();
  const previous = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const reportDate = previous.toISOString().slice(0, 7);
  try {
    const saved = await downloadFinanceReport(
      client,
      { vendorNumber, regionCode: "ZZ", reportDate, reportType: "FINANCIAL" },
      join(dir, "finance.tsv"),
    );
    console.log(
      `finance:     ${reportDate} ZZ ok — ${saved.rows} row(s), ${saved.bytesWritten} byte(s)`,
    );
  } catch (error) {
    if (error instanceof AscPermissionError) {
      console.log(
        "finance:     403 — this key lacks the finance role (the permission diagnostic itself is the verified behavior); skipped",
      );
      return;
    }
    if (error instanceof AscNotFoundError) {
      console.log(
        `finance:     no ${reportDate} report (fiscal month may not be closed yet; enriched 404 verified)`,
      );
      return;
    }
    throw error;
  }
}

/**
 * Read-only analytics chain: requests → report catalog → first instance with
 * segments → one segment downloaded with checksum verification. A long-term
 * regression guard for the external-host download + MD5 path.
 *
 * @param {import("../../dist/index.js").AscClient} client
 * @param {string} appId
 * @param {string} dir
 */
async function runAnalyticsReadChain(client, appId, dir) {
  const requests = await listAnalyticsReportRequests(client, appId, {
    scope: "all-pages",
  });
  const active = requests.items.find(
    (request) => request.attributes?.stoppedDueToInactivity !== true,
  );
  if (active === undefined) {
    console.log(
      "analytics:   no active report request (one-time setup: 'reports analytics ensure-request'); skipped",
    );
    return;
  }
  const reports = await listAnalyticsReports(client, active.id, {
    scope: { maxItems: 5 },
  });
  console.log(
    `analytics:   request ...${active.id.slice(-4)} [${active.attributes?.accessType ?? "?"}], ` +
      `${reports.items.length} report(s) in the catalog${reports.truncated ? " (more exist)" : ""}`,
  );

  for (const report of reports.items) {
    const instances = await listAnalyticsReportInstances(client, report.id, {
      scope: { maxItems: 1 },
    });
    const instance = instances.items[0];
    if (instance === undefined) {
      continue;
    }
    const segments = await listAnalyticsReportSegments(client, instance.id, {
      scope: "single-page",
    });
    const segment = segments.items[0];
    const url = segment?.attributes?.url;
    if (segment === undefined || url === undefined) {
      continue;
    }
    const checksum = segment.attributes?.checksum ?? null;
    const md5 =
      checksum === null
        ? undefined
        : /^(?:md5:)?([0-9a-f]{32})$/i.exec(checksum.trim())?.[1];
    const saved = await downloadExternalFile(
      url,
      join(dir, "segment-000.csv"),
      { ...(md5 !== undefined && { expectedMd5: md5 }) },
    );
    console.log(
      `analytics:   1 segment of "${report.attributes?.name ?? "?"}" ` +
        `(${instance.attributes?.granularity ?? "?"} ${instance.attributes?.processingDate ?? "?"}) — ` +
        `${saved.rows} row(s), ${saved.wasGzipped ? "gzip" : "plain"} payload, ` +
        `checksum ${md5 !== undefined ? "verified (md5)" : `not enforced (declared: ${checksum ?? "absent"})`}`,
    );
    return;
  }
  console.log(
    "analytics:   no instance with segments yet (first data appears 1-2 days after the request is created); segment download skipped",
  );
}

/**
 * Patch one localization's promotionalText to a marker, read it back, and
 * restore the original. Prefers a version in an editable (non-public) state;
 * falls back to the live version, where the marker rides Apple's async
 * store-publish pipeline — the immediate same-run restore means it
 * realistically never reaches the public page.
 *
 * @param {import("../../dist/index.js").AscClient} client
 * @param {import("../../dist/index.js").App} app
 */
async function runWriteCheck(client, app) {
  const editableStates = [
    "PREPARE_FOR_SUBMISSION",
    "METADATA_REJECTED",
    "DEVELOPER_REJECTED",
    "REJECTED",
    "INVALID_BINARY",
  ];
  const candidates = await listAppStoreVersions(client, app.id, {
    scope: { maxItems: 20 },
    fields: ["versionString", "appVersionState"],
  });
  const target =
    candidates.items.find((version) =>
      editableStates.includes(version.attributes?.appVersionState ?? ""),
    ) ??
    candidates.items.find(
      (version) =>
        version.attributes?.appVersionState === "READY_FOR_DISTRIBUTION",
    );
  if (target === undefined) {
    console.log(
      "write check: skipped (no version in an editable or live state)",
    );
    return;
  }

  const localizations = await listAppStoreVersionLocalizations(
    client,
    target.id,
    { scope: "all-pages", fields: ["locale", "promotionalText"] },
  );
  const localization =
    localizations.items.find(
      (item) => item.attributes?.locale === app.attributes?.primaryLocale,
    ) ?? localizations.items[0];
  if (localization === undefined) {
    console.log("write check: skipped (the version has no localizations)");
    return;
  }

  const original = localization.attributes?.promotionalText;
  const marker = `smoke check ${new Date().toISOString()}`;
  console.log(
    `write check: patching promotionalText on ${target.attributes?.versionString ?? "?"} ` +
      `[${target.attributes?.appVersionState ?? "?"}] ${localization.attributes?.locale ?? "?"}`,
  );
  await updateAppStoreVersionLocalization(client, localization.id, {
    promotionalText: marker,
  });

  // The restore must run whether or not the read-back succeeds, and a restore
  // failure must not mask the read-back failure — hence captured errors
  // instead of try/finally (throwing from finally swallows the original).
  let checkError;
  try {
    const readBack = await getAppStoreVersionLocalization(
      client,
      localization.id,
      { fields: ["promotionalText"] },
    );
    if (readBack.data.attributes?.promotionalText !== marker) {
      throw new Error(
        "write check failed: the read-back did not return the marker value",
      );
    }
    console.log("write check: patch + read-back ok (promotionalText)");
  } catch (error) {
    checkError = error;
  }

  try {
    // `?? null` restores "unset" when the field had no value before.
    await updateAppStoreVersionLocalization(client, localization.id, {
      promotionalText: original ?? null,
    });
    console.log("write check: original value restored");
  } catch (restoreError) {
    // Promotional text is public store copy — printing it is non-sensitive
    // and exactly what an operator needs to restore by hand.
    console.error(
      `write check: RESTORE FAILED for localization ${localization.id}; ` +
        `original promotionalText was: ${original ?? "(unset)"}`,
    );
    throw checkError ?? restoreError;
  }
  if (checkError !== undefined) {
    throw checkError;
  }
}

/**
 * Upload-then-delete one throwaway screenshot on an editable version, end to
 * end: ensure the display-type set, reserve + transfer (auth-free PUT) +
 * commit, read the processing status, then delete the asset (and the set if
 * this run created it). `wait: false` on the upload keeps the asset id in hand
 * for cleanup even when processing later reports FAILED; getScreenshotStatus
 * reports a terminal FAILED without throwing, so a dimension rejection on the
 * generated image is informational, not a smoke failure.
 *
 * @param {import("../../dist/index.js").AscClient} client
 * @param {import("../../dist/index.js").App} app
 */
async function runMediaCheck(client, app) {
  // Editable, non-live states only: a screenshot upload appends to the set,
  // and the smoke must never touch the public store listing.
  const editableStates = [
    "PREPARE_FOR_SUBMISSION",
    "METADATA_REJECTED",
    "DEVELOPER_REJECTED",
    "REJECTED",
    "INVALID_BINARY",
  ];
  const versions = await listAppStoreVersions(client, app.id, {
    scope: { maxItems: 20 },
    fields: ["versionString", "appVersionState"],
  });
  const target = versions.items.find((version) =>
    editableStates.includes(version.attributes?.appVersionState ?? ""),
  );
  if (target === undefined) {
    console.log(
      "media:       skipped (no version in an editable state; media smoke avoids the live listing)",
    );
    return;
  }
  const localizations = await listAppStoreVersionLocalizations(
    client,
    target.id,
    { scope: "all-pages", fields: ["locale"] },
  );
  const localization =
    localizations.items.find(
      (item) => item.attributes?.locale === app.attributes?.primaryLocale,
    ) ?? localizations.items[0];
  if (localization === undefined) {
    console.log(
      "media:       skipped (the editable version has no localizations)",
    );
    return;
  }

  // 6.7" portrait. If Apple's specs drift, processing reports FAILED below and
  // the run still verifies the reserve/transfer/commit mechanics and cleans up.
  const displayType = "APP_IPHONE_67";
  const ensured = await ensureScreenshotSet(
    client,
    localization.id,
    displayType,
  );
  console.log(
    `media:       set ...${ensured.set.id.slice(-4)} for ${displayType} (${ensured.created ? "created" : "reused"})`,
  );

  const dir = await mkdtemp(join(tmpdir(), "asc-smoke-media-"));
  const file = join(dir, "smoke-shot.png");
  await writeFile(file, solidColorPng(1290, 2796));

  let assetId;
  try {
    const uploaded = await uploadScreenshot(client, ensured.set.id, file, {
      wait: false,
    });
    assetId = uploaded.assetId;
    console.log(
      `media:       reserved+transferred+committed ...${assetId.slice(-4)} ` +
        `(${uploaded.bytesTransferred} byte(s) over ${uploaded.operationCount} op(s), auth-free PUT)`,
    );
    const status = await getScreenshotStatus(client, assetId, {
      wait: true,
      pollIntervalMs: 2000,
      pollTimeoutMs: 60000,
    });
    if (status.complete) {
      console.log(
        `media:       processing COMPLETE for ...${assetId.slice(-4)}`,
      );
    } else if (status.failed) {
      console.log(
        `media:       processing FAILED (content/dimension rejected; upload mechanics verified): ${status.finalState}`,
      );
    } else {
      console.log(
        `media:       still processing after timeout (mechanics verified); state: ${status.finalState}`,
      );
    }
  } finally {
    if (assetId !== undefined) {
      await deleteAppScreenshot(client, assetId);
      console.log(`media:       deleted screenshot ...${assetId.slice(-4)}`);
    }
    if (ensured.created) {
      await deleteAppScreenshotSet(client, ensured.set.id);
      console.log("media:       deleted the screenshot set this run created");
    }
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * TestFlight reversible / read-only smoke. Every step is either a pure read or
 * a create-then-delete that cleans up only what this run created. HIGH-SIDE-
 * EFFECT writes (add tester → real invitation email, submit beta review → real
 * immutable Apple review, expire build → irreversible) are NEVER smoked here.
 *
 * @param {import("../../dist/index.js").AscClient} client
 * @param {string} appId
 */
async function runTestflightCheck(client, appId) {
  // Read the existing groups (read-only).
  const groups = await listBetaGroups(client, {
    scope: { maxItems: 5 },
    app: [appId],
  });
  console.log(
    `testflight:  ${groups.items.length} beta group(s) read${groups.truncated ? " (more exist)" : ""}`,
  );

  // If a group exists, read its membership (read-only).
  const firstGroup = groups.items[0];
  if (firstGroup !== undefined) {
    const members = await listGroupTesters(client, firstGroup.id, {
      scope: { maxItems: 1 },
    });
    console.log(
      `testflight:  group ...${firstGroup.id.slice(-4)} membership read (${members.items.length === 0 ? "empty page" : "has members"})`,
    );
  }

  // Read builds (read-only).
  const builds = await listBuilds(client, {
    scope: { maxItems: 3 },
    app: [appId],
  });
  console.log(
    `testflight:  ${builds.items.length} build(s) read${builds.truncated ? " (more exist)" : ""}`,
  );

  // Read feedback collections — counts/metadata only, never downloading PII.
  // An insufficient role (live-verify #19) is a reported skip, not a failure.
  try {
    const crashes = await listCrashFeedback(client, appId, {
      scope: { maxItems: 1 },
    });
    const shots = await listScreenshotFeedback(client, appId, {
      scope: { maxItems: 1 },
    });
    console.log(
      `testflight:  feedback readable (crash: ${crashes.items.length === 0 ? "none on first page" : "present"}, ` +
        `screenshot: ${shots.items.length === 0 ? "none on first page" : "present"}); no attachments downloaded`,
    );
  } catch (error) {
    if (error instanceof AscPermissionError) {
      console.log(
        "testflight:  feedback 403 — this key lacks the TestFlight feedback role (permission diagnostic verified); skipped",
      );
    } else {
      throw error;
    }
  }

  // Reversible create-then-delete of one empty beta group. The group carries no
  // testers, so creation has no email side effect; the finally block deletes
  // only the group this run created.
  const name = `asc-smoke ${new Date().toISOString()}`;
  let createdGroupId;
  try {
    const created = await createBetaGroup(client, appId, { name });
    createdGroupId = created.data.id;
    console.log(
      `testflight:  created empty beta group ...${createdGroupId.slice(-4)} (no testers → no invitations)`,
    );
  } catch (error) {
    if (error instanceof AscPermissionError) {
      console.log(
        "testflight:  group create 403 — this key lacks the beta-group write role (permission diagnostic verified); skipped",
      );
      return;
    }
    throw error;
  } finally {
    if (createdGroupId !== undefined) {
      await deleteBetaGroup(client, createdGroupId);
      console.log(
        `testflight:  deleted the smoke beta group ...${createdGroupId.slice(-4)} (delete accepted)`,
      );
    }
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/**
 * Builds a minimal valid 8-bit RGB PNG of the given size, filled with black.
 * Solid content deflates to a few kilobytes regardless of dimensions. Kept
 * dependency-free (node:zlib only) so the smoke script needs no image library.
 *
 * @param {number} width
 * @param {number} height
 * @returns {Buffer}
 */
function solidColorPng(width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = truecolor RGB
  // bytes 10-12 (compression, filter, interlace) stay 0.
  // Each scanline is a leading filter byte (0 = none) then width RGB triples;
  // an all-zero raw buffer is a black image.
  const raw = Buffer.alloc(height * (1 + width * 3));
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
