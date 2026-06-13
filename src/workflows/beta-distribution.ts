import {
  addTestersToGroup,
  createBetaGroup,
  listBetaGroups,
  readRecruitmentCriteria,
} from "../capabilities/beta-groups.js";
import type {
  BetaGroup,
  BetaGroupCreateAttributes,
} from "../capabilities/beta-groups.js";
import {
  createBetaTester,
  listBetaTesters,
} from "../capabilities/beta-testers.js";
import type { BetaTesterCreateAttributes } from "../capabilities/beta-testers.js";
import {
  createBetaAppLocalization,
  createBetaBuildLocalization,
  listBetaAppLocalizations,
  listBetaBuildLocalizations,
  updateBetaAppLocalization,
  updateBetaBuildLocalization,
} from "../capabilities/beta-localizations.js";
import type {
  BetaAppLocalization,
  BetaAppLocalizationUpdateAttributes,
  BetaBuildLocalization,
  BetaBuildLocalizationUpdateAttributes,
} from "../capabilities/beta-localizations.js";
import {
  getBetaAppReviewDetail,
  updateBetaAppReviewDetail,
} from "../capabilities/beta-review.js";
import type {
  BetaAppReviewDetail,
  BetaAppReviewDetailUpdateAttributes,
} from "../capabilities/beta-review.js";
import { AscInvalidParameterError } from "../errors.js";
import type { AscClient } from "../http/client.js";

// findLatestProcessedBuild lives in the builds capability (it is a pure
// listBuilds composition); re-exported here so distribution callers find the
// whole "resolve + ensure" toolbox in one place.
export { findLatestProcessedBuild } from "../capabilities/builds.js";

// ---------------------------------------------------------------------------
// Group find-or-create
// ---------------------------------------------------------------------------

export interface EnsureBetaGroupResult {
  readonly group: BetaGroup;
  /** False when an existing group with this name was reused. */
  readonly created: boolean;
}

/**
 * Finds an app's beta group by exact name, or creates it. Does NOT guard
 * against a concurrent double-create (TOCTOU) — consistent with the rest of
 * the layer's ensure/resolve helpers, which assume a single real agent acting
 * in sequence. Creating a fresh group with no testers has no email side effect.
 */
export async function ensureBetaGroup(
  client: AscClient,
  appId: string,
  name: string,
  createAttributes: Omit<BetaGroupCreateAttributes, "name"> = {},
): Promise<EnsureBetaGroupResult> {
  const existing = await listBetaGroups(client, {
    scope: "all-pages",
    app: [appId],
    name: [name],
  });
  const match = existing.items.find((group) => group.attributes?.name === name);
  if (match !== undefined) {
    return { group: match, created: false };
  }
  const created = await createBetaGroup(client, appId, {
    ...createAttributes,
    name,
  });
  return { group: created.data, created: true };
}

// ---------------------------------------------------------------------------
// Bulk add testers to a group (ensure each tester, then one linkage POST)
// ---------------------------------------------------------------------------

/**
 * Default linkage-array chunk size for the bulk-add relationship POST. Apple's
 * exact per-request relationship cap is unconfirmed (live-verify #5); 50 is a
 * conservative chunk that comfortably clears the typical JSON:API limits while
 * keeping each invitation batch auditable.
 */
export const DEFAULT_LINKAGE_BATCH_SIZE = 50;

export interface BulkAddTestersResult {
  /** Tester ids resolved (found-or-created), de-duplicated, in input order. */
  readonly testerIds: readonly string[];
  /** Emails for which a new tester was created (vs an existing one reused). */
  readonly createdEmails: readonly string[];
  /** Number of relationship POST chunks issued. */
  readonly linkageBatches: number;
}

interface BulkAddTestersOptions {
  readonly batchSize?: number;
  /** Name/attrs applied to any tester that has to be created. */
  readonly attributesForEmail?: (
    email: string,
  ) => Omit<BetaTesterCreateAttributes, "email">;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let at = 0; at < items.length; at += size) {
    out.push(items.slice(at, at + size));
  }
  return out;
}

/**
 * Ensures a tester exists for each email (reuse by exact-email match, else
 * create WITHOUT a group so the create itself does not email), then links the
 * whole set to the group in a single chunked relationship POST — which is the
 * step that emails the TestFlight invitations. Splitting "create the testers"
 * from "link them once" keeps invitation emails to one batched moment. This is
 * a high side-effect write the caller is responsible for gating.
 */
export async function bulkAddTestersToGroup(
  client: AscClient,
  groupId: string,
  emails: readonly string[],
  options: BulkAddTestersOptions = {},
): Promise<BulkAddTestersResult> {
  const batchSize = options.batchSize ?? DEFAULT_LINKAGE_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new AscInvalidParameterError(
      `batchSize must be a positive integer; got ${String(batchSize)}.`,
    );
  }

  const testerIds: string[] = [];
  const createdEmails: string[] = [];
  const seen = new Set<string>();
  for (const email of emails) {
    if (seen.has(email)) {
      continue;
    }
    seen.add(email);
    const existing = await listBetaTesters(client, {
      scope: "all-pages",
      email: [email],
    });
    const match = existing.items.find(
      (tester) => tester.attributes?.email === email,
    );
    if (match !== undefined) {
      testerIds.push(match.id);
      continue;
    }
    const attributes: BetaTesterCreateAttributes = {
      email,
      ...(options.attributesForEmail?.(email) ?? {}),
    };
    const created = await createBetaTester(client, attributes);
    testerIds.push(created.data.id);
    createdEmails.push(email);
  }

  const batches = chunk(testerIds, batchSize);
  for (const batch of batches) {
    await addTestersToGroup(client, groupId, batch);
  }
  return {
    testerIds,
    createdEmails,
    linkageBatches: batches.length,
  };
}

// ---------------------------------------------------------------------------
// Localization upsert-by-locale (create when absent, patch when present)
// ---------------------------------------------------------------------------

export interface UpsertLocalizationResult<Resource> {
  readonly localization: Resource;
  /** False when an existing localization for this locale was patched. */
  readonly created: boolean;
}

/**
 * Upserts a build's "what to test" note for a locale: PATCH when the locale
 * already has a localization, POST otherwise — avoiding the duplicate-locale
 * 409. live-verify: Apple's exact conflict behavior on a duplicate-locale POST
 * is unconfirmed; the find-first read keeps us off that path.
 */
export async function upsertBetaBuildLocalization(
  client: AscClient,
  buildId: string,
  locale: string,
  whatsNew: string,
): Promise<UpsertLocalizationResult<BetaBuildLocalization>> {
  const existing = await listBetaBuildLocalizations(client, {
    scope: "all-pages",
    build: [buildId],
    locale: [locale],
  });
  const match = existing.items.find(
    (item) => item.attributes?.locale === locale,
  );
  if (match !== undefined) {
    const attributes: BetaBuildLocalizationUpdateAttributes = { whatsNew };
    const updated = await updateBetaBuildLocalization(
      client,
      match.id,
      attributes,
    );
    return { localization: updated.data, created: false };
  }
  const created = await createBetaBuildLocalization(client, buildId, {
    locale,
    whatsNew,
  });
  return { localization: created.data, created: true };
}

/**
 * Upserts an app-level TestFlight localization for a locale: PATCH the existing
 * one or POST a new one. The create requires a locale; updates carry only the
 * mutable fields (locale is immutable).
 */
export async function upsertBetaAppLocalization(
  client: AscClient,
  appId: string,
  locale: string,
  attributes: BetaAppLocalizationUpdateAttributes,
): Promise<UpsertLocalizationResult<BetaAppLocalization>> {
  const existing = await listBetaAppLocalizations(client, {
    scope: "all-pages",
    app: [appId],
    locale: [locale],
  });
  const match = existing.items.find(
    (item) => item.attributes?.locale === locale,
  );
  if (match !== undefined) {
    const updated = await updateBetaAppLocalization(
      client,
      match.id,
      attributes,
    );
    return { localization: updated.data, created: false };
  }
  const created = await createBetaAppLocalization(client, appId, {
    ...attributes,
    locale,
  });
  return { localization: created.data, created: true };
}

// ---------------------------------------------------------------------------
// Beta app review detail find-or-read (+ a convenient set)
// ---------------------------------------------------------------------------

/**
 * Reads an app's beta app review detail by app id — the find half of "set". The
 * detail has no create/delete (it is a per-app singleton), so a true upsert is
 * just read-then-patch; this wrapper exists so callers can hold the detail for
 * a subsequent update without re-deriving the app-scoped lookup.
 */
export async function findBetaAppReviewDetail(
  client: AscClient,
  appId: string,
): Promise<BetaAppReviewDetail> {
  return getBetaAppReviewDetail(client, { appId });
}

/**
 * Sets an app's beta app review detail: resolve it by app id, then PATCH the
 * given fields. Returns the updated detail. No-op fields are simply omitted by
 * the caller's attributes object.
 */
export async function setBetaAppReviewDetail(
  client: AscClient,
  appId: string,
  attributes: BetaAppReviewDetailUpdateAttributes,
): Promise<BetaAppReviewDetail> {
  const detail = await findBetaAppReviewDetail(client, appId);
  const updated = await updateBetaAppReviewDetail(
    client,
    detail.id,
    attributes,
  );
  return updated.data;
}

// ---------------------------------------------------------------------------
// Recruitment criteria find-or-read (resolve the per-group singleton id)
// ---------------------------------------------------------------------------

/**
 * Reads a group's current recruitment criterion id (the per-group singleton),
 * or undefined when none is configured. Used by the "set" verb to decide
 * PATCH-vs-POST without a second round trip. A null `data` (no criteria yet) is
 * the absence signal.
 */
export async function findRecruitmentCriterionId(
  client: AscClient,
  groupId: string,
): Promise<string | undefined> {
  const response = await readRecruitmentCriteria(client, groupId);
  const resource = response.data as { id?: string } | null;
  return resource?.id;
}
