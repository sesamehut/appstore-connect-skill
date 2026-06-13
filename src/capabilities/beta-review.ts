import type { components, operations } from "../generated/asc-openapi.js";
import { AscNotFoundError } from "../errors.js";
import type { AscClient } from "../http/client.js";
import { expectDocument } from "./internal.js";
import { readPaged } from "../pagination/paginate.js";
import type {
  CollectedRead,
  PaginateOptions,
  ReadScope,
} from "../pagination/paginate.js";

export type BetaAppReviewDetail = components["schemas"]["BetaAppReviewDetail"];
export type BetaAppReviewDetailResponse =
  components["schemas"]["BetaAppReviewDetailResponse"];
export type BetaAppReviewSubmission =
  components["schemas"]["BetaAppReviewSubmission"];
export type BetaAppReviewSubmissionResponse =
  components["schemas"]["BetaAppReviewSubmissionResponse"];
export type BetaReviewState = components["schemas"]["BetaReviewState"];

/** No create/delete for review detail (it is per-app and auto-existing); only updates. */
export type BetaAppReviewDetailUpdateAttributes = NonNullable<
  components["schemas"]["BetaAppReviewDetailUpdateRequest"]["data"]["attributes"]
>;

type ReviewDetailsQuery = NonNullable<
  operations["betaAppReviewDetails_getCollection"]["parameters"]["query"]
>;
type ReviewSubmissionsQuery = NonNullable<
  operations["betaAppReviewSubmissions_getCollection"]["parameters"]["query"]
>;

// ---------------------------------------------------------------------------
// Beta app review detail (contact/demo info Apple uses for beta review)
// ---------------------------------------------------------------------------

export interface GetBetaAppReviewDetailOptions {
  /**
   * App id — REQUIRED. The collection GET 400s without filter[app], and
   * there is no get-by-app-id single endpoint, so the app id is the only
   * lookup key.
   */
  readonly appId: string;
  readonly fields?: ReviewDetailsQuery["fields[betaAppReviewDetails]"];
}

/**
 * Reads an app's beta app review detail. The detail is a per-app singleton
 * resolved through the required-filter collection; a miss throws
 * AscNotFoundError. live-verify (实机核实 #12): whether every app auto-has a
 * readable detail before any submission, or it appears only after a review
 * context exists — handled defensively as a not-found here.
 */
export async function getBetaAppReviewDetail(
  client: AscClient,
  options: GetBetaAppReviewDetailOptions,
): Promise<BetaAppReviewDetail> {
  const query: ReviewDetailsQuery = {
    "filter[app]": [options.appId],
    ...(options.fields !== undefined && {
      "fields[betaAppReviewDetails]": options.fields,
    }),
  };
  const read = await readPaged(
    client,
    "/v1/betaAppReviewDetails",
    { params: { query } },
    "single-page",
  );
  const match = read.items[0];
  if (match === undefined) {
    throw new AscNotFoundError(
      `App ${options.appId} has no beta app review detail yet.`,
    );
  }
  return match;
}

/**
 * Updates the beta app review detail (contact + demo account fields). Takes the
 * detail id (read it first via getBetaAppReviewDetail). There is no create or
 * delete — the resource is per-app and persistent.
 */
export async function updateBetaAppReviewDetail(
  client: AscClient,
  detailId: string,
  attributes: BetaAppReviewDetailUpdateAttributes,
): Promise<BetaAppReviewDetailResponse> {
  const { data } = await client.PATCH("/v1/betaAppReviewDetails/{id}", {
    params: { path: { id: detailId } },
    body: {
      data: { type: "betaAppReviewDetails", id: detailId, attributes },
    },
  });
  return expectDocument(data);
}

// ---------------------------------------------------------------------------
// Beta app review submission (the actual TestFlight external-review request)
// ---------------------------------------------------------------------------

export interface ListBetaAppReviewSubmissionsOptions {
  /**
   * Build id — REQUIRED. The collection GET 400s without filter[build], and
   * there is no get-by-build-id single endpoint at this path; the build id is
   * the lookup key. (Use getBuildBetaAppReviewSubmission for the build-side
   * to-one related read.)
   */
  readonly buildId: string;
  readonly scope: ReadScope;
  readonly pageLimit?: ReviewSubmissionsQuery["limit"];
  readonly betaReviewState?: ReviewSubmissionsQuery["filter[betaReviewState]"];
  readonly fields?: ReviewSubmissionsQuery["fields[betaAppReviewSubmissions]"];
  readonly pagination?: PaginateOptions;
}

/** Reads a build's beta app review submissions (status history). */
export function listBetaAppReviewSubmissions(
  client: AscClient,
  options: ListBetaAppReviewSubmissionsOptions,
): Promise<CollectedRead<BetaAppReviewSubmission>> {
  const query: ReviewSubmissionsQuery = {
    "filter[build]": [options.buildId],
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.betaReviewState !== undefined && {
      "filter[betaReviewState]": options.betaReviewState,
    }),
    ...(options.fields !== undefined && {
      "fields[betaAppReviewSubmissions]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/betaAppReviewSubmissions",
    { params: { query } },
    options.scope,
    options.pagination,
  );
}

/** Reads one beta app review submission by ASC id. */
export async function getBetaAppReviewSubmission(
  client: AscClient,
  submissionId: string,
): Promise<BetaAppReviewSubmissionResponse> {
  const { data } = await client.GET("/v1/betaAppReviewSubmissions/{id}", {
    params: { path: { id: submissionId } },
  });
  return expectDocument(data);
}

/**
 * Reads a build's current beta app review submission via the build-side to-one
 * related endpoint — the convenient "what is this build's review status" read
 * when only the build id is in hand.
 */
export async function getBuildBetaAppReviewSubmission(
  client: AscClient,
  buildId: string,
): Promise<BetaAppReviewSubmissionResponse> {
  const { data } = await client.GET("/v1/builds/{id}/betaAppReviewSubmission", {
    params: { path: { id: buildId } },
  });
  return expectDocument(data);
}

/**
 * Submits a build for TestFlight external beta review. A real Apple review is
 * triggered; the submission cannot be PATCHed or DELETEd afterward. A rejected
 * submission requires a fresh POST to re-submit (live-verify #13). The caller
 * is responsible for gating this high side-effect write.
 */
export async function submitBuildForBetaReview(
  client: AscClient,
  buildId: string,
): Promise<BetaAppReviewSubmissionResponse> {
  const { data } = await client.POST("/v1/betaAppReviewSubmissions", {
    body: {
      data: {
        type: "betaAppReviewSubmissions",
        relationships: {
          build: { data: { type: "builds", id: buildId } },
        },
      },
    },
  });
  return expectDocument(data);
}
