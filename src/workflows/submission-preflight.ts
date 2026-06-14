import {
  getAppStoreVersion,
  getVersionPhasedRelease,
} from "../capabilities/app-store-versions-release.js";
import type {
  AppVersionState,
  PhasedReleaseState,
} from "../capabilities/app-store-versions-release.js";
import { findAppStoreReviewDetail } from "../capabilities/app-store-review-details.js";
import { getAgeRatingDeclaration } from "../capabilities/age-rating.js";
import { getBuild } from "../capabilities/builds.js";
import { listAppStoreVersionLocalizations } from "../capabilities/app-store-version-localizations.js";
import type { AppStoreVersionLocalization } from "../capabilities/app-store-version-localizations.js";
import { AscNotFoundError } from "../errors.js";
import type { AscClient } from "../http/client.js";

/**
 * Structured submission blockers. These are derived advisory codes — preflight
 * surfaces why-not at a medium depth (decision A2) and deliberately does NOT
 * replicate Apple's server-side validation matrix (per-locale / screenshot
 * dimensions / territory completeness). The real hard gate is ASC returning a
 * STATE_ERROR on the submit PATCH, normalized through the existing error path;
 * preflight is a pre-submit advisory, not a hard precondition.
 */
export type SubmissionBlocker =
  | "VERSION_NOT_EDITABLE"
  | "MISSING_BUILD"
  | "BUILD_NOT_ELIGIBLE"
  | "BUILD_EXPORT_COMPLIANCE_UNSET"
  | "MISSING_REVIEW_DETAIL"
  | "MISSING_AGE_RATING"
  | "MISSING_LOCALIZATION";

/** The version states from which a submission can still be assembled/edited. */
const EDITABLE_VERSION_STATES = new Set<AppVersionState>([
  "PREPARE_FOR_SUBMISSION",
  "WAITING_FOR_EXPORT_COMPLIANCE",
  "READY_FOR_REVIEW",
]);

/**
 * The required-localization fields checked for non-emptiness. Apple requires a
 * description and keywords per active locale; the rest are optional or
 * URL-conditional. This is the medium-depth check — presence of the fields, not
 * Apple's full per-territory completeness matrix.
 */
const REQUIRED_LOCALIZATION_FIELDS: readonly (keyof NonNullable<
  AppStoreVersionLocalization["attributes"]
>)[] = ["description", "keywords"];

export interface PreflightSnapshot {
  readonly versionId: string;
  readonly appId: string;
  readonly versionString?: string;
  readonly appVersionState?: AppVersionState;
  readonly versionEditable: boolean;
  /** Attached build id, or undefined when no build is set. */
  readonly buildId?: string;
  readonly buildProcessingState?: string;
  /** usesNonExemptEncryption on the attached build: true/false/undefined(unset). */
  readonly buildExportComplianceSet: boolean;
  readonly hasReviewDetail: boolean;
  readonly hasAgeRating: boolean;
  readonly localizationCount: number;
  /** Locales missing a required field (description/keywords). */
  readonly incompleteLocales: readonly string[];
  /** Phased-release read-only fields (decision B2: no write surface). */
  readonly phasedReleaseState?: PhasedReleaseState;
  readonly phasedReleaseCurrentDayNumber?: number;
}

export interface PreflightResult {
  readonly submittable: boolean;
  readonly blockers: readonly SubmissionBlocker[];
  readonly snapshot: PreflightSnapshot;
}

/**
 * Reads a version's attached build id from the version-instance include, or
 * undefined. The build relationship arrives in `data.relationships.build.data`.
 */
function attachedBuildId(
  relationships: { build?: { data?: { id: string } | null } } | undefined,
): string | undefined {
  return relationships?.build?.data?.id ?? undefined;
}

/**
 * Aggregates a read-only submission-readiness report for a version: version
 * state + attached build + required-localization presence + review-detail +
 * age-rating + export-compliance + phased-release read-only fields, folded into
 * { submittable, blockers[], snapshot }. Read-only; performs no writes and does
 * not advance any state. live-verify (实机核实 #5): whether age-rating /
 * export-compliance are enforced at create-item or only at submit — preflight
 * treats them as advisory blockers regardless.
 */
export async function preflightVersionSubmission(
  client: AscClient,
  appId: string,
  versionId: string,
): Promise<PreflightResult> {
  const blockers: SubmissionBlocker[] = [];

  const versionResponse = await getAppStoreVersion(client, versionId, {
    include: ["build", "appStoreVersionPhasedRelease"],
  });
  const version = versionResponse.data;
  const appVersionState = version.attributes?.appVersionState;
  const versionEditable =
    appVersionState !== undefined &&
    EDITABLE_VERSION_STATES.has(appVersionState);
  if (!versionEditable) {
    blockers.push("VERSION_NOT_EDITABLE");
  }

  // Build: must be attached, eligible, and have export compliance decided.
  const buildId = attachedBuildId(version.relationships);
  let buildProcessingState: string | undefined;
  let buildExportComplianceSet = false;
  if (buildId === undefined) {
    blockers.push("MISSING_BUILD");
  } else {
    const buildResponse = await getBuild(client, buildId);
    const buildAttributes = buildResponse.data.attributes;
    buildProcessingState = buildAttributes?.processingState;
    if (
      buildProcessingState !== undefined &&
      buildProcessingState !== "VALID"
    ) {
      blockers.push("BUILD_NOT_ELIGIBLE");
    }
    if (buildAttributes?.usesNonExemptEncryption === undefined) {
      blockers.push("BUILD_EXPORT_COMPLIANCE_UNSET");
    } else {
      buildExportComplianceSet = true;
    }
  }

  // Review detail: per-version find (undefined when absent, no throw).
  const reviewDetail = await findAppStoreReviewDetail(client, versionId);
  const hasReviewDetail = reviewDetail !== undefined;
  if (!hasReviewDetail) {
    blockers.push("MISSING_REVIEW_DETAIL");
  }

  // Age rating: app-info scoped; a not-found is an absence blocker, not an error.
  let hasAgeRating = false;
  try {
    await getAgeRatingDeclaration(client, appId);
    hasAgeRating = true;
  } catch (error) {
    if (!(error instanceof AscNotFoundError)) {
      throw error;
    }
    blockers.push("MISSING_AGE_RATING");
  }

  // Localizations: each must carry the required fields (description/keywords).
  const localizations = await listAppStoreVersionLocalizations(
    client,
    versionId,
    { scope: "all-pages" },
  );
  const incompleteLocales: string[] = [];
  for (const localization of localizations.items) {
    const attributes = localization.attributes;
    const missing = REQUIRED_LOCALIZATION_FIELDS.some((field) => {
      const value = attributes?.[field];
      return value === undefined || value === "";
    });
    if (missing) {
      incompleteLocales.push(attributes?.locale ?? localization.id);
    }
  }
  if (localizations.items.length === 0 || incompleteLocales.length > 0) {
    blockers.push("MISSING_LOCALIZATION");
  }

  // Phased release: read-only fields for the status panorama (decision B2). The
  // version-side to-one read returns { data: null } when none is configured.
  const phasedResponse = await getVersionPhasedRelease(client, versionId);
  const phasedRelease = phasedResponse.data as {
    attributes?: {
      phasedReleaseState?: PhasedReleaseState;
      currentDayNumber?: number;
    };
  } | null;

  const snapshot: PreflightSnapshot = {
    versionId,
    appId,
    ...(version.attributes?.versionString !== undefined && {
      versionString: version.attributes.versionString,
    }),
    ...(appVersionState !== undefined && { appVersionState }),
    versionEditable,
    ...(buildId !== undefined && { buildId }),
    ...(buildProcessingState !== undefined && { buildProcessingState }),
    buildExportComplianceSet,
    hasReviewDetail,
    hasAgeRating,
    localizationCount: localizations.items.length,
    incompleteLocales,
    ...(phasedRelease?.attributes?.phasedReleaseState !== undefined && {
      phasedReleaseState: phasedRelease.attributes.phasedReleaseState,
    }),
    ...(phasedRelease?.attributes?.currentDayNumber !== undefined && {
      phasedReleaseCurrentDayNumber: phasedRelease.attributes.currentDayNumber,
    }),
  };

  return { submittable: blockers.length === 0, blockers, snapshot };
}
