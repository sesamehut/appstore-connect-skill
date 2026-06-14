import { beforeAll, describe, expect, it } from "vitest";

import {
  cancelReviewSubmission,
  releaseVersionNow,
  submitVersionForReview,
} from "../src/workflows/submission-assembly.js";
import { preflightVersionSubmission } from "../src/workflows/submission-preflight.js";
import { ASC_API_BASE_URL } from "../src/http/client.js";
import type { AscClient } from "../src/http/client.js";
import { JSON_HEADERS, makeOfflineClient } from "./helpers/asc-fixtures.js";
import { useMockAgent } from "./helpers/mock-agent.js";

const getAgent = useMockAgent();

let client: AscClient;

beforeAll(async () => {
  client = await makeOfflineClient();
});

// --- interceptor helpers ----------------------------------------------------

/**
 * Intercepts a GET matched by an exact path predicate (so the shared
 * /v1/appStoreVersions/v1 prefix doesn't collide between the instance read and
 * its to-one related reads), recording the order in which it fired.
 */
function ascGetExact(
  isPath: (path: string) => boolean,
  data: object | string,
  log?: string[],
  label?: string,
): void {
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({ path: isPath, method: "GET" })
    .reply(() => {
      if (log !== undefined && label !== undefined) {
        log.push(`GET ${label}`);
      }
      return {
        statusCode: 200,
        data,
        responseOptions: { headers: JSON_HEADERS },
      };
    });
}

function ascList(prefix: string, items: readonly unknown[]): void {
  ascGetExact((path) => path.startsWith(prefix), {
    data: items,
    links: { self: `${ASC_API_BASE_URL}/v1/x` },
  });
}

/** Intercepts a write and records both the order and the captured body. */
function ascWrite(
  method: "POST" | "PATCH",
  path: string,
  status: number,
  data: object | string,
  log: string[],
  label: string,
): () => string | undefined {
  let body: string | undefined;
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({ path, method })
    .reply((request) => {
      body = request.body as string | undefined;
      log.push(`${method} ${label}`);
      return {
        statusCode: status,
        data,
        responseOptions: { headers: JSON_HEADERS },
      };
    });
  return () => body;
}

function pathExact(path: string): (candidate: string) => boolean {
  return (candidate) => candidate === path || candidate.startsWith(`${path}?`);
}

// ---------------------------------------------------------------------------
// submitVersionForReview: open-or-reuse container -> add item -> submitted=true
// ---------------------------------------------------------------------------

describe("submitVersionForReview (assembly order + async-accept)", () => {
  it("opens a container, attaches the version item, PATCHes submitted=true IN ORDER", async () => {
    const order: string[] = [];
    // No existing unsubmitted container holds v1 -> the find scan returns [].
    ascGetExact(
      pathExact("/v1/reviewSubmissions"),
      { data: [], links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissions` } },
      order,
      "reviewSubmissions (scan)",
    );
    const containerBody = ascWrite(
      "POST",
      "/v1/reviewSubmissions",
      201,
      {
        data: {
          type: "reviewSubmissions",
          id: "sub-new",
          attributes: { state: "READY_FOR_REVIEW" },
        },
        links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissions/sub-new` },
      },
      order,
      "reviewSubmissions",
    );
    const itemBody = ascWrite(
      "POST",
      "/v1/reviewSubmissionItems",
      201,
      {
        data: { type: "reviewSubmissionItems", id: "item-new" },
        links: {
          self: `${ASC_API_BASE_URL}/v1/reviewSubmissionItems/item-new`,
        },
      },
      order,
      "reviewSubmissionItems",
    );
    const submitBody = ascWrite(
      "PATCH",
      "/v1/reviewSubmissions/sub-new",
      200,
      {
        data: {
          type: "reviewSubmissions",
          id: "sub-new",
          attributes: { state: "WAITING_FOR_REVIEW" },
        },
        links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissions/sub-new` },
      },
      order,
      "reviewSubmissions/sub-new",
    );

    const result = await submitVersionForReview(client, "app-1", "v1");

    // Strict three-step order: scan -> create container -> create item -> submit.
    expect(order).toEqual([
      "GET reviewSubmissions (scan)",
      "POST reviewSubmissions",
      "POST reviewSubmissionItems",
      "PATCH reviewSubmissions/sub-new",
    ]);
    expect(JSON.parse(containerBody() ?? "{}")).toMatchObject({
      data: { relationships: { app: { data: { id: "app-1" } } } },
    });
    expect(JSON.parse(itemBody() ?? "{}")).toMatchObject({
      data: {
        relationships: {
          reviewSubmission: { data: { id: "sub-new" } },
          appStoreVersion: { data: { id: "v1" } },
        },
      },
    });
    // The submit PATCH drives submitted=true (async-accept, not a state write).
    expect(JSON.parse(submitBody() ?? "{}")).toMatchObject({
      data: { attributes: { submitted: true } },
    });
    expect(result).toMatchObject({
      containerCreated: true,
      itemCreated: true,
      submitted: true,
    });
  });

  it("reuses an unsubmitted container already holding the version (NO extra POST)", async () => {
    const order: string[] = [];
    // Find scan: one open container holding v1 already.
    ascGetExact(
      pathExact("/v1/reviewSubmissions"),
      {
        data: [
          {
            type: "reviewSubmissions",
            id: "sub-open",
            attributes: { state: "READY_FOR_REVIEW" },
          },
        ],
        links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissions` },
      },
      order,
      "reviewSubmissions (scan)",
    );
    // Its items include the v1 item, so neither container nor item is recreated.
    ascGetExact(
      pathExact("/v1/reviewSubmissions/sub-open/items"),
      {
        data: [
          {
            type: "reviewSubmissionItems",
            id: "item-open",
            relationships: {
              appStoreVersion: {
                data: { type: "appStoreVersions", id: "v1" },
              },
            },
          },
        ],
        links: {
          self: `${ASC_API_BASE_URL}/v1/reviewSubmissions/sub-open/items`,
        },
      },
      order,
      "reviewSubmissions/sub-open/items",
    );
    const submitBody = ascWrite(
      "PATCH",
      "/v1/reviewSubmissions/sub-open",
      200,
      {
        data: {
          type: "reviewSubmissions",
          id: "sub-open",
          attributes: { state: "WAITING_FOR_REVIEW" },
        },
        links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissions/sub-open` },
      },
      order,
      "reviewSubmissions/sub-open",
    );

    const result = await submitVersionForReview(client, "app-1", "v1");

    // Idempotent reuse: no POST to /v1/reviewSubmissions or
    // /v1/reviewSubmissionItems was registered, so a recreate attempt would
    // fail the disabled connect. The order proves only the scan + submit ran.
    expect(order).toEqual([
      "GET reviewSubmissions (scan)",
      "GET reviewSubmissions/sub-open/items",
      "PATCH reviewSubmissions/sub-open",
    ]);
    expect(result).toMatchObject({
      containerCreated: false,
      itemCreated: false,
      submitted: true,
    });
    expect(result.submission.id).toBe("sub-open");
    expect(result.item.id).toBe("item-open");
    expect(JSON.parse(submitBody() ?? "{}")).toMatchObject({
      data: { attributes: { submitted: true } },
    });
  });
});

// ---------------------------------------------------------------------------
// cancel / release: async-accept envelopes
// ---------------------------------------------------------------------------

describe("cancelReviewSubmission (async-accept)", () => {
  it("PATCHes canceled=true and reports acceptance without read-back", async () => {
    const order: string[] = [];
    const bodyOf = ascWrite(
      "PATCH",
      "/v1/reviewSubmissions/sub-1",
      200,
      {
        data: {
          type: "reviewSubmissions",
          id: "sub-1",
          attributes: { state: "CANCELING" },
        },
        links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissions/sub-1` },
      },
      order,
      "cancel",
    );

    const result = await cancelReviewSubmission(client, "sub-1");

    // Exactly one write, no follow-up read of the final state.
    expect(order).toEqual(["PATCH cancel"]);
    expect(JSON.parse(bodyOf() ?? "{}")).toMatchObject({
      data: { attributes: { canceled: true } },
    });
    expect(result).toMatchObject({ canceled: true });
    expect(result.submission.id).toBe("sub-1");
  });
});

describe("releaseVersionNow (async-accept)", () => {
  it("POSTs the release request and returns the accepted request id", async () => {
    const order: string[] = [];
    ascWrite(
      "POST",
      "/v1/appStoreVersionReleaseRequests",
      201,
      {
        data: { type: "appStoreVersionReleaseRequests", id: "rel-1" },
        links: {
          self: `${ASC_API_BASE_URL}/v1/appStoreVersionReleaseRequests/rel-1`,
        },
      },
      order,
      "release",
    );

    const result = await releaseVersionNow(client, "v1");

    expect(order).toEqual(["POST release"]);
    expect(result).toEqual({ releaseRequestId: "rel-1", accepted: true });
  });
});

// ---------------------------------------------------------------------------
// preflight: structured blockers[] per branch, READ-ONLY (no writes registered)
// ---------------------------------------------------------------------------

/**
 * Registers the read chain a preflight performs against a version, with the
 * branch-controlling fixtures. Every interceptor is a GET; no write is ever
 * registered, so a write would fail the disabled connect — proving preflight is
 * read-only.
 */
function stubPreflightReads(opts: {
  versionState: string;
  buildId?: string;
  buildProcessingState?: string;
  buildUsesNonExemptEncryption?: boolean;
  reviewDetail: object | null;
  ageRatingIncluded: unknown[];
  localizations: unknown[];
}): void {
  // Version instance read (carries the build relationship + phased include).
  ascGetExact(pathExact("/v1/appStoreVersions/v1"), {
    data: {
      type: "appStoreVersions",
      id: "v1",
      attributes: {
        versionString: "1.1.2",
        appVersionState: opts.versionState,
      },
      relationships:
        opts.buildId !== undefined
          ? { build: { data: { type: "builds", id: opts.buildId } } }
          : {},
    },
    links: { self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1` },
  });
  if (opts.buildId !== undefined) {
    ascGetExact(pathExact(`/v1/builds/${opts.buildId}`), {
      data: {
        type: "builds",
        id: opts.buildId,
        attributes: {
          ...(opts.buildProcessingState !== undefined && {
            processingState: opts.buildProcessingState,
          }),
          ...(opts.buildUsesNonExemptEncryption !== undefined && {
            usesNonExemptEncryption: opts.buildUsesNonExemptEncryption,
          }),
        },
      },
      links: { self: `${ASC_API_BASE_URL}/v1/builds/${opts.buildId}` },
    });
  }
  ascGetExact(pathExact("/v1/appStoreVersions/v1/appStoreReviewDetail"), {
    data: opts.reviewDetail,
    links: {
      self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1/appStoreReviewDetail`,
    },
  });
  ascGetExact(pathExact("/v1/apps/app-1/appInfos"), {
    data: [{ type: "appInfos", id: "ai-1" }],
    included: opts.ageRatingIncluded,
    links: { self: `${ASC_API_BASE_URL}/v1/apps/app-1/appInfos` },
  });
  ascList(
    "/v1/appStoreVersions/v1/appStoreVersionLocalizations",
    opts.localizations,
  );
  ascGetExact(
    pathExact("/v1/appStoreVersions/v1/appStoreVersionPhasedRelease"),
    {
      data: null,
      links: {
        self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1/appStoreVersionPhasedRelease`,
      },
    },
  );
}

const READY_AGE_RATING = [
  { type: "ageRatingDeclarations", id: "ar-1", attributes: {} },
];
const READY_LOCALIZATION = [
  {
    type: "appStoreVersionLocalizations",
    id: "loc-1",
    attributes: { locale: "en-US", description: "d", keywords: "k" },
  },
];

describe("preflightVersionSubmission (structured blockers[], read-only)", () => {
  it("is submittable with no blockers when everything is present", async () => {
    stubPreflightReads({
      versionState: "PREPARE_FOR_SUBMISSION",
      buildId: "b9",
      buildProcessingState: "VALID",
      buildUsesNonExemptEncryption: false,
      reviewDetail: { type: "appStoreReviewDetails", id: "rd-1" },
      ageRatingIncluded: READY_AGE_RATING,
      localizations: READY_LOCALIZATION,
    });

    const result = await preflightVersionSubmission(client, "app-1", "v1");

    expect(result.blockers).toEqual([]);
    expect(result.submittable).toBe(true);
    expect(result.snapshot.buildId).toBe("b9");
    expect(result.snapshot.hasReviewDetail).toBe(true);
  });

  it("flags MISSING_BUILD when the version has no attached build", async () => {
    stubPreflightReads({
      versionState: "PREPARE_FOR_SUBMISSION",
      reviewDetail: { type: "appStoreReviewDetails", id: "rd-1" },
      ageRatingIncluded: READY_AGE_RATING,
      localizations: READY_LOCALIZATION,
    });

    const result = await preflightVersionSubmission(client, "app-1", "v1");

    expect(result.blockers).toContain("MISSING_BUILD");
    expect(result.submittable).toBe(false);
  });

  it("flags MISSING_REVIEW_DETAIL when the version has no review detail", async () => {
    stubPreflightReads({
      versionState: "PREPARE_FOR_SUBMISSION",
      buildId: "b9",
      buildProcessingState: "VALID",
      buildUsesNonExemptEncryption: false,
      reviewDetail: null,
      ageRatingIncluded: READY_AGE_RATING,
      localizations: READY_LOCALIZATION,
    });

    const result = await preflightVersionSubmission(client, "app-1", "v1");

    expect(result.blockers).toContain("MISSING_REVIEW_DETAIL");
  });

  it("flags MISSING_AGE_RATING when no declaration is included", async () => {
    stubPreflightReads({
      versionState: "PREPARE_FOR_SUBMISSION",
      buildId: "b9",
      buildProcessingState: "VALID",
      buildUsesNonExemptEncryption: false,
      reviewDetail: { type: "appStoreReviewDetails", id: "rd-1" },
      ageRatingIncluded: [],
      localizations: READY_LOCALIZATION,
    });

    const result = await preflightVersionSubmission(client, "app-1", "v1");

    expect(result.blockers).toContain("MISSING_AGE_RATING");
  });

  it("flags BUILD_EXPORT_COMPLIANCE_UNSET when usesNonExemptEncryption is unset", async () => {
    stubPreflightReads({
      versionState: "PREPARE_FOR_SUBMISSION",
      buildId: "b9",
      buildProcessingState: "VALID",
      // usesNonExemptEncryption deliberately omitted (undefined = undecided).
      reviewDetail: { type: "appStoreReviewDetails", id: "rd-1" },
      ageRatingIncluded: READY_AGE_RATING,
      localizations: READY_LOCALIZATION,
    });

    const result = await preflightVersionSubmission(client, "app-1", "v1");

    expect(result.blockers).toContain("BUILD_EXPORT_COMPLIANCE_UNSET");
    expect(result.snapshot.buildExportComplianceSet).toBe(false);
  });

  it("flags VERSION_NOT_EDITABLE when the version is past the editable states", async () => {
    stubPreflightReads({
      versionState: "PENDING_APPLE_RELEASE",
      buildId: "b9",
      buildProcessingState: "VALID",
      buildUsesNonExemptEncryption: false,
      reviewDetail: { type: "appStoreReviewDetails", id: "rd-1" },
      ageRatingIncluded: READY_AGE_RATING,
      localizations: READY_LOCALIZATION,
    });

    const result = await preflightVersionSubmission(client, "app-1", "v1");

    expect(result.blockers).toContain("VERSION_NOT_EDITABLE");
    expect(result.snapshot.versionEditable).toBe(false);
  });
});
