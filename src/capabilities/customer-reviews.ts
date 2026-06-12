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

export type CustomerReview = components["schemas"]["CustomerReview"];
/**
 * The document for ONE customer review (Apple's name). Not the developer
 * response — that resource is CustomerReviewResponseV1.
 */
export type CustomerReviewResponse =
  components["schemas"]["CustomerReviewResponse"];
/** The developer-response resource (Apple's V1 naming). */
export type CustomerReviewResponseV1 =
  components["schemas"]["CustomerReviewResponseV1"];
export type CustomerReviewResponseV1Response =
  components["schemas"]["CustomerReviewResponseV1Response"];

type ReviewsQuery = NonNullable<
  operations["apps_customerReviews_getToManyRelated"]["parameters"]["query"]
>;
type VersionReviewsQuery = NonNullable<
  operations["appStoreVersions_customerReviews_getToManyRelated"]["parameters"]["query"]
>;
type ReviewInstanceQuery = NonNullable<
  operations["customerReviews_getInstance"]["parameters"]["query"]
>;
type ReviewResponseQuery = NonNullable<
  operations["customerReviews_response_getToOneRelated"]["parameters"]["query"]
>;

export interface ListCustomerReviewsOptions {
  /** Read-cost declaration; always an explicit call-site decision. */
  readonly scope: ReadScope;
  /** Page size sent to ASC (`limit`, server-capped at 200). */
  readonly pageLimit?: ReviewsQuery["limit"];
  /** Star ratings to keep, as ASC string filters, e.g. ["1", "2"]. */
  readonly rating?: ReviewsQuery["filter[rating]"];
  readonly territory?: ReviewsQuery["filter[territory]"];
  /** true → only reviews with a published developer response; false → only without. */
  readonly hasPublishedResponse?: ReviewsQuery["exists[publishedResponse]"];
  readonly sort?: ReviewsQuery["sort"];
  readonly fields?: ReviewsQuery["fields[customerReviews]"];
  readonly pagination?: PaginateOptions;
}

function buildReviewsQuery(options: ListCustomerReviewsOptions): ReviewsQuery {
  return {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.rating !== undefined && { "filter[rating]": options.rating }),
    ...(options.territory !== undefined && {
      "filter[territory]": options.territory,
    }),
    ...(options.hasPublishedResponse !== undefined && {
      "exists[publishedResponse]": options.hasPublishedResponse,
    }),
    ...(options.sort !== undefined && { sort: options.sort }),
    ...(options.fields !== undefined && {
      "fields[customerReviews]": options.fields,
    }),
  };
}

/**
 * Reads an app's customer reviews, under an explicit pagination scope.
 *
 * `include` is deliberately not exposed on list reads: the pagination
 * collector keeps only `data`, so included resources would be dropped
 * silently. "Reviews still needing a reply" is served first-class by
 * `hasPublishedResponse: false`.
 */
export function listCustomerReviewsForApp(
  client: AscClient,
  appId: string,
  options: ListCustomerReviewsOptions,
): Promise<CollectedRead<CustomerReview>> {
  const query = buildReviewsQuery(options);
  return readPaged(
    client,
    "/v1/apps/{id}/customerReviews",
    { params: { path: { id: appId }, query } },
    options.scope,
    options.pagination,
  );
}

/** Reads one App Store version's customer reviews; semantics as the app variant. */
export function listCustomerReviewsForVersion(
  client: AscClient,
  versionId: string,
  options: ListCustomerReviewsOptions,
): Promise<CollectedRead<CustomerReview>> {
  // Assigning the app-variant query where the version variant is expected is
  // the compile-time drift alarm: today the two generated types are
  // structurally identical, and a contract upgrade that diverges them fails
  // here instead of at runtime.
  const query: VersionReviewsQuery = buildReviewsQuery(options);
  return readPaged(
    client,
    "/v1/appStoreVersions/{id}/customerReviews",
    { params: { path: { id: versionId }, query } },
    options.scope,
    options.pagination,
  );
}

export interface GetCustomerReviewOptions {
  readonly fields?: ReviewInstanceQuery["fields[customerReviews]"];
  readonly include?: ReviewInstanceQuery["include"];
  /** Field selection for the included developer response (with `include`). */
  readonly responseFields?: ReviewInstanceQuery["fields[customerReviewResponses]"];
}

/**
 * Reads one customer review by its ASC id. Returns the full response
 * document so `include` relationships arrive intact in `included`.
 */
export async function getCustomerReview(
  client: AscClient,
  reviewId: string,
  options: GetCustomerReviewOptions = {},
): Promise<CustomerReviewResponse> {
  const query: ReviewInstanceQuery = {
    ...(options.fields !== undefined && {
      "fields[customerReviews]": options.fields,
    }),
    ...(options.include !== undefined && { include: options.include }),
    ...(options.responseFields !== undefined && {
      "fields[customerReviewResponses]": options.responseFields,
    }),
  };
  const { data } = await client.GET("/v1/customerReviews/{id}", {
    params: { path: { id: reviewId }, query },
  });
  return expectDocument(data);
}

export interface GetCustomerReviewResponseOptions {
  readonly fields?: ReviewResponseQuery["fields[customerReviewResponses]"];
}

/**
 * Reads the developer response to a review. A review without a response is a
 * normalized not-found error, not an empty document — the uniform error
 * contract of this layer.
 */
export async function getCustomerReviewResponse(
  client: AscClient,
  reviewId: string,
  options: GetCustomerReviewResponseOptions = {},
): Promise<CustomerReviewResponseV1Response> {
  const query: ReviewResponseQuery = {
    ...(options.fields !== undefined && {
      "fields[customerReviewResponses]": options.fields,
    }),
  };
  const { data } = await client.GET("/v1/customerReviews/{id}/response", {
    params: { path: { id: reviewId }, query },
  });
  const document = expectDocument(data);
  // ASC answers "no response yet" on this to-one endpoint with 200 and
  // `data: null` (verified live 2026-06), not the 404 the generated
  // non-nullable type suggests; the widening cast restores reality.
  const resource = document.data as CustomerReviewResponseV1 | null;
  if (resource === null) {
    throw new AscNotFoundError(
      `Review ${reviewId} has no developer response yet.`,
    );
  }
  return document;
}

/**
 * Creates the developer response, or replaces the existing one — ASC's POST
 * is a documented upsert ("set" carries that honestly). Publication is
 * asynchronous: the returned state starts as PENDING_PUBLISH.
 */
export async function setCustomerReviewResponse(
  client: AscClient,
  reviewId: string,
  responseBody: string,
): Promise<CustomerReviewResponseV1Response> {
  const { data } = await client.POST("/v1/customerReviewResponses", {
    body: {
      data: {
        type: "customerReviewResponses",
        attributes: { responseBody },
        relationships: {
          review: {
            data: { type: "customerReviews", id: reviewId },
          },
        },
      },
    },
  });
  return expectDocument(data);
}
