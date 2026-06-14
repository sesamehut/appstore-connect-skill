// Submission-specific argument parsing shared by the submission command tree.
// Cross-tree pieces (forceArg/requireForce/requireIdList, attributeArgs/
// collectAttributes/fromJsonArg) are reused from testflight-shared.ts and
// metadata-shared.ts and are NOT duplicated here; this file holds only the
// validators unique to the submission/release surface: the releaseType enum,
// the ISO date-time check, and the explicit-boolean parser. All raise
// CliUsageError (exit 64) before any network call.

import { getAppStoreVersion } from "../../capabilities/app-store-versions-release.js";
import type { ReleaseType } from "../../capabilities/app-store-versions-release.js";
import type { cliContextOf } from "../context.js";
import { CliUsageError } from "../exit-codes.js";

/**
 * The release-timing values Apple accepts on a version. Validated locally
 * (unlike ASC-validated enums) because the verb names them in a small closed
 * set and a typo must fail as a clear usage error before any PATCH, not as a
 * confusing relationship rejection. `satisfies` keeps the list from drifting
 * past the contract enum; Apple stays authoritative.
 */
const RELEASE_TYPES = [
  "MANUAL",
  "AFTER_APPROVAL",
  "SCHEDULED",
] as const satisfies readonly NonNullable<ReleaseType>[];

/** Parses and validates a `--release-type` flag against the known enum. */
export function parseReleaseType(raw: string): NonNullable<ReleaseType> {
  if ((RELEASE_TYPES as readonly string[]).includes(raw)) {
    return raw as NonNullable<ReleaseType>;
  }
  throw new CliUsageError(
    `--release-type expects one of ${RELEASE_TYPES.join(" | ")}, got "${raw}".`,
  );
}

// A full ISO-8601 date-time: date, a `T` separator, a time (HH:MM, optional
// seconds/fraction), and an EXPLICIT zone (`Z` or a numeric `±HH:MM` offset).
// Date.parse alone is too loose — it accepts a bare date and even a bare year —
// so the offset/Z requirement is what makes a bare date fail. Apple's
// earliestReleaseDate carries an explicit offset (see the valueHint example).
const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Validates an ISO-8601 date-time string locally (so a malformed
 * --earliest-release-date fails as a usage error, not as an opaque ASC
 * rejection). Apple expects a full date-time with an explicit timezone; a bare
 * date (which Date.parse would happily accept) or an unparseable value is
 * rejected here before the PATCH.
 */
export function parseIsoDateTime(raw: string, flag: string): string {
  if (!ISO_DATE_TIME.test(raw) || Number.isNaN(Date.parse(raw))) {
    throw new CliUsageError(
      `${flag} expects a full ISO-8601 date-time with a timezone (e.g. 2026-07-01T12:00:00-07:00), got "${raw}".`,
    );
  }
  return raw;
}

/**
 * Parses an explicit `<true|false>` flag into a boolean. Modeled as a string
 * (not a bare boolean) so the verb distinguishes "set it false" from "flag
 * absent" and the caller must state the value, mirroring parseAutoNotify.
 */
export function parseExplicitBoolean(
  raw: string | undefined,
  flag: string,
): boolean {
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  throw new CliUsageError(
    `${flag} expects true or false, got "${raw ?? "(missing)"}".`,
  );
}

/**
 * Resolves the app id for a version: returns the explicit --app when given,
 * otherwise reads the version's app relationship. Both the preflight (age-rating
 * is app-info scoped) and the submit verb (the review container is app-scoped)
 * need an app id even when the caller only knows the version.
 */
export async function resolveAppId(
  cli: ReturnType<typeof cliContextOf>,
  versionId: string,
  explicitAppId: string | undefined,
): Promise<string> {
  if (explicitAppId !== undefined) {
    return explicitAppId;
  }
  const version = await getAppStoreVersion(await cli.client(), versionId, {
    include: ["app"],
  });
  const appId = version.data.relationships?.app?.data?.id;
  if (appId === undefined) {
    throw new CliUsageError(
      `Could not resolve the app for version ${versionId}; pass --app <appId> explicitly.`,
    );
  }
  return appId;
}
