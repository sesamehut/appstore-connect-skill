import {
  createReviewSubmission,
  createReviewSubmissionItem,
  listReviewSubmissionItems,
  listReviewSubmissions,
  updateReviewSubmission,
} from "../capabilities/review-submissions.js";
import type {
  ReviewSubmission,
  ReviewSubmissionItem,
  ReviewSubmissionPlatform,
  ReviewSubmissionResponse,
} from "../capabilities/review-submissions.js";
import { createAppStoreVersionReleaseRequest } from "../capabilities/app-store-versions-release.js";
import type { AppStoreVersionReleaseRequestResponse } from "../capabilities/app-store-versions-release.js";
import type { AscClient } from "../http/client.js";

// These orchestrations carry the phase's high side-effect writes (submit /
// cancel / release). They stay deliberately thin: the actual --force gating and
// the zero-network "missing --force" exit 64 live in the CLI layer (stage 2),
// which calls these only after requireForce passes. None are ever exercised by
// the smoke script.

// Containers this code may reuse instead of opening a fresh one. The two states
// are NOT the same shape and are reused differently:
//   READY_FOR_REVIEW   — a not-yet-submitted container that still accepts a new
//                         item create (the open-and-arm path below creates one).
//   UNRESOLVED_ISSUES  — a POST-submission container: Apple reviewed it and
//                         returned issues. It already holds the version's item,
//                         so reuse is safe ONLY by re-PATCHing submitted=true
//                         (the resolve-and-resubmit path); the reuse branch
//                         never creates a fresh item here.
// live-verify (实机核实 #4): the exact set of states that still accept item
// create / re-arm.
const UNSUBMITTED_STATES = new Set<string>([
  "READY_FOR_REVIEW",
  "UNRESOLVED_ISSUES",
]);

export interface SubmitVersionForReviewResult {
  /** The container the version's item lives in (reused or freshly opened). */
  readonly submission: ReviewSubmission;
  /** The version's submission item. */
  readonly item: ReviewSubmissionItem;
  /** False when an already-open container was reused for this version. */
  readonly containerCreated: boolean;
  /** False when the version's item was already present (idempotent re-add). */
  readonly itemCreated: boolean;
  /**
   * Async-accept: true once submitted=true was PATCHed. The server progresses
   * state asynchronously, so this is "accepted", not an immediate read-back.
   */
  readonly submitted: boolean;
}

/**
 * Finds an unsubmitted container that already holds the target version, or
 * returns undefined. Apple allows up to 2 concurrent containers per platform,
 * so containers are NOT globally unique — idempotency keys on whether the
 * version's item already sits in an unsubmitted container, not on "the app has
 * a container". Scans the app's unsubmitted containers and their items.
 */
async function findContainerHoldingVersion(
  client: AscClient,
  appId: string,
  versionId: string,
): Promise<
  { submission: ReviewSubmission; item: ReviewSubmissionItem } | undefined
> {
  const containers = await listReviewSubmissions(client, {
    appId,
    scope: "all-pages",
  });
  for (const submission of containers.items) {
    const state = submission.attributes?.state;
    if (state !== undefined && !UNSUBMITTED_STATES.has(state)) {
      continue;
    }
    const items = await listReviewSubmissionItems(client, submission.id, {
      scope: "all-pages",
    });
    const match = items.items.find(
      (item) => item.relationships?.appStoreVersion?.data?.id === versionId,
    );
    if (match !== undefined) {
      return { submission, item: match };
    }
  }
  return undefined;
}

/**
 * Submits an App Store version for review: open-or-reuse an unsubmitted
 * container holding the version, ensure the version item is attached, then PATCH
 * submitted=true. The submit PATCH starts a real Apple review and is modeled as
 * async-accept (no immediate state read-back). High side-effect — gated by the
 * CLI --force layer; never smoked. live-verify (实机核实 #1): whether the three
 * steps (create container -> create item -> submitted=true) are strictly
 * required or adding an item auto-arms.
 */
export async function submitVersionForReview(
  client: AscClient,
  appId: string,
  versionId: string,
  platform?: ReviewSubmissionPlatform,
): Promise<SubmitVersionForReviewResult> {
  const existing = await findContainerHoldingVersion(client, appId, versionId);

  let submission: ReviewSubmission;
  let item: ReviewSubmissionItem;
  let containerCreated = false;
  let itemCreated = false;

  if (existing !== undefined) {
    submission = existing.submission;
    item = existing.item;
  } else {
    const created = await createReviewSubmission(client, appId, platform);
    submission = created.data;
    containerCreated = true;
    const createdItem = await createReviewSubmissionItem(
      client,
      submission.id,
      {
        appStoreVersion: versionId,
      },
    );
    item = createdItem.data;
    itemCreated = true;
  }

  await updateReviewSubmission(client, submission.id, { submitted: true });

  return { submission, item, containerCreated, itemCreated, submitted: true };
}

export interface CancelReviewSubmissionResult {
  readonly submission: ReviewSubmission;
  /** Async-accept: true once canceled=true was PATCHed. */
  readonly canceled: boolean;
}

/**
 * Withdraws a review submission by PATCHing canceled=true. Cancellation has a
 * cost: the version flips to Developer Rejected and a re-submit reviews from
 * scratch. Async-accept (no immediate state read-back); high side-effect, gated
 * by the CLI --force layer, never smoked. live-verify (实机核实 #10): how soon
 * state reflects CANCELING after the PATCH.
 */
export async function cancelReviewSubmission(
  client: AscClient,
  submissionId: string,
): Promise<CancelReviewSubmissionResult> {
  const updated: ReviewSubmissionResponse = await updateReviewSubmission(
    client,
    submissionId,
    { canceled: true },
  );
  return { submission: updated.data, canceled: true };
}

export interface ReleaseVersionNowResult {
  /** The created release-request id (the resource has no attributes). */
  readonly releaseRequestId: string;
  /** Async-accept: the release was accepted, not asserted complete. */
  readonly accepted: boolean;
}

/**
 * Releases an approved version to public immediately by POSTing an
 * appStoreVersionReleaseRequest. The release-request resource has no
 * attributes; the version must be in a manual-release pending state. Modeled as
 * async-accept; high side-effect, gated by the CLI --force layer, never smoked.
 */
export async function releaseVersionNow(
  client: AscClient,
  versionId: string,
): Promise<ReleaseVersionNowResult> {
  const created: AppStoreVersionReleaseRequestResponse =
    await createAppStoreVersionReleaseRequest(client, versionId);
  return { releaseRequestId: created.data.id, accepted: true };
}
