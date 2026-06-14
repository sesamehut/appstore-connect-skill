/**
 * The single source of truth for capability status, feeding the
 * `capabilities` command, the planned-domain stubs, and SKILL.md's boundary
 * lists. The product-scope doc (docs/product/api-scope.md) mandates that
 * "not implemented here yet" and "not supported by Apple's API" stay
 * distinguishable — this registry is where that distinction lives in code.
 */

export type PlannedMilestone = "M7";

export type DomainStatus =
  | { readonly implemented: true }
  | { readonly implemented: false; readonly milestone: PlannedMilestone };

export interface DomainEntry {
  readonly name: string;
  readonly summary: string;
  readonly status: DomainStatus;
}

export const DOMAINS: readonly DomainEntry[] = [
  {
    name: "apps",
    summary: "List apps and read app details",
    status: { implemented: true },
  },
  {
    name: "versions",
    summary: "List an app's App Store versions",
    status: { implemented: true },
  },
  {
    name: "metadata",
    summary:
      "Read and update store metadata and localizations, app level and version level",
    status: { implemented: true },
  },
  {
    name: "reviews",
    summary: "Read customer reviews; post or replace developer responses",
    status: { implemented: true },
  },
  {
    name: "doctor",
    summary: "Offline environment and credentials self-check",
    status: { implemented: true },
  },
  {
    name: "capabilities",
    summary: "Machine-readable map of implemented/planned/unsupported tasks",
    status: { implemented: true },
  },
  {
    name: "reports",
    summary: "Sales, finance, and analytics report workflows",
    status: { implemented: true },
  },
  {
    name: "media",
    summary: "Screenshot and preview upload workflows",
    status: { implemented: true },
  },
  {
    name: "testflight",
    summary:
      "TestFlight beta groups, testers, test info, beta review detail, and feedback",
    status: { implemented: true },
  },
  {
    name: "builds",
    summary:
      "Builds: list/get/latest/expire, beta detail, notes, beta review, group distribution, individual testers, pre-release versions",
    status: { implemented: true },
  },
  {
    name: "submission",
    summary:
      "Submission and release: preflight readiness, status, review detail, release config, export compliance, submit/cancel/release",
    status: { implemented: true },
  },
];

export interface UnsupportedTask {
  readonly task: string;
  readonly guidance: string;
}

/** Tasks Apple's public API does not offer; the web UI is the only path. */
export const API_UNSUPPORTED: readonly UnsupportedTask[] = [
  {
    task: "Editing or deleting customer reviews or star ratings",
    guidance:
      "Review content belongs to the reviewer; the only API-side action is a developer response (asc reviews respond).",
  },
  {
    task: "App Review communication threads (Resolution Center messages)",
    guidance:
      "Handle in App Store Connect on the web: My Apps → your app → App Review.",
  },
  {
    task: "Agreements, tax, banking, and payout configuration",
    guidance:
      "Handle in App Store Connect on the web: Business / Agreements section.",
  },
  {
    task: "Creating or downloading App Store Connect API keys",
    guidance:
      "Handle in App Store Connect on the web: Users and Access → Integrations.",
  },
  {
    task: "Creating or reading legacy appStoreVersionSubmissions (per-version submit)",
    guidance:
      "Apple removed this model (no create request remains). Use the modern review submissions instead: asc submission preflight / status / submit.",
  },
  {
    task: "Editing a review submission's items after it has been submitted",
    guidance:
      "A submitted review submission is immutable except to cancel it. Cancel and re-assemble: asc submission cancel <id> --force, then submit again (re-review starts from scratch).",
  },
  {
    task: "Un-canceling or reviving a canceled review submission",
    guidance:
      "Cancellation is one-way; the version flips to Developer Rejected. Open a fresh submission and submit again: asc submission submit --version <id> --app <id> --force.",
  },
];
