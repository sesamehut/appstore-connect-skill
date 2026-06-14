// One-place redaction for review-detail output, mirroring sanitizeScreenshotUrl
// in workflows/feedback-files.ts: a single primitive both command files import
// so the demo-account password is dropped in exactly one spot. The PASSWORD is
// the only secret on a review detail; every other field (contact info, demo
// account NAME, notes, demoAccountRequired) stays visible because the agent
// needs them to confirm what was written.

import type { AppStoreReviewDetail } from "../capabilities/app-store-review-details.js";
import type { BetaAppReviewDetail } from "../capabilities/beta-review.js";

/**
 * A review-detail resource with the demo-account password stripped and a
 * synthetic `demoAccountPasswordSet` boolean in its place. Generic over both
 * the App Store and beta variants — both expose the same demoAccountPassword
 * attribute, so the redactor is written against their shared shape.
 */
export type RedactedReviewDetail<
  T extends AppStoreReviewDetail | BetaAppReviewDetail,
> = Omit<T, "attributes"> & {
  attributes?: Omit<NonNullable<T["attributes"]>, "demoAccountPassword"> & {
    /** True iff a non-empty demoAccountPassword was present before redaction. */
    demoAccountPasswordSet: boolean;
  };
};

/**
 * Returns a shallow copy of a review-detail resource with attributes.
 * demoAccountPassword REMOVED and a synthetic boolean demoAccountPasswordSet
 * ADDED (true iff a non-empty password was present). The password must never
 * reach stdout/logs/the envelope; routing every review-detail emit site through
 * this is the single guarantee of that. Accepts both AppStoreReviewDetail and
 * BetaAppReviewDetail.
 */
export function redactReviewDetailSecrets<
  T extends AppStoreReviewDetail | BetaAppReviewDetail,
>(resource: T): RedactedReviewDetail<T> {
  const { attributes, ...rest } = resource;
  if (attributes === undefined) {
    return {
      ...rest,
      attributes: { demoAccountPasswordSet: false },
    } as RedactedReviewDetail<T>;
  }
  const { demoAccountPassword, ...safeAttributes } = attributes;
  return {
    ...rest,
    attributes: {
      ...safeAttributes,
      demoAccountPasswordSet:
        demoAccountPassword !== undefined && demoAccountPassword !== "",
    },
  } as RedactedReviewDetail<T>;
}
