import type { components, operations } from "../generated/asc-openapi.js";
import { AscInvalidParameterError } from "../errors.js";
import type { AscClient } from "../http/client.js";
import { expectDocument } from "./internal.js";
import { readPaged } from "../pagination/paginate.js";
import type {
  CollectedRead,
  PaginateOptions,
  ReadScope,
} from "../pagination/paginate.js";

export type ReviewSubmission = components["schemas"]["ReviewSubmission"];
export type ReviewSubmissionResponse =
  components["schemas"]["ReviewSubmissionResponse"];
export type ReviewSubmissionItem =
  components["schemas"]["ReviewSubmissionItem"];
export type ReviewSubmissionItemResponse =
  components["schemas"]["ReviewSubmissionItemResponse"];

/**
 * The submission lifecycle state. The contract carries it as an inline enum on
 * the resource (no named schema), so it is derived from the attribute. It is a
 * read-only server-derived value — the writes below drive it indirectly through
 * the `submitted`/`canceled` booleans, never by setting `state`.
 */
export type ReviewSubmissionState = NonNullable<
  NonNullable<ReviewSubmission["attributes"]>["state"]
>;
/** Item-level state, likewise inline and read-only. */
export type ReviewSubmissionItemState = NonNullable<
  NonNullable<ReviewSubmissionItem["attributes"]>["state"]
>;

/**
 * Only `submitted`/`canceled` are writable on a submission. `state` and
 * `platform` are not driver fields here: `state` is read-only, and platform is
 * fixed at create. The update request type pins this surface.
 */
export type ReviewSubmissionUpdateAttributes = NonNullable<
  components["schemas"]["ReviewSubmissionUpdateRequest"]["data"]["attributes"]
>;
/** Item update carries only the `removed`/`resolved` booleans (state is read-only). */
export type ReviewSubmissionItemUpdateAttributes = NonNullable<
  components["schemas"]["ReviewSubmissionItemUpdateRequest"]["data"]["attributes"]
>;
/** Submission platform at create time (optional; Apple infers per build/version). */
export type ReviewSubmissionPlatform = NonNullable<
  components["schemas"]["ReviewSubmissionCreateRequest"]["data"]["attributes"]
>["platform"];

type ReviewSubmissionsQuery = NonNullable<
  operations["reviewSubmissions_getCollection"]["parameters"]["query"]
>;
type ReviewSubmissionInstanceQuery = NonNullable<
  operations["reviewSubmissions_getInstance"]["parameters"]["query"]
>;
type ReviewSubmissionItemsQuery = NonNullable<
  operations["reviewSubmissions_items_getToManyRelated"]["parameters"]["query"]
>;

// ---------------------------------------------------------------------------
// reviewSubmissions (the modern App Store review container)
// ---------------------------------------------------------------------------

export interface ListReviewSubmissionsOptions {
  /**
   * App id — REQUIRED. The collection GET's filter[app] is non-optional in the
   * contract (it 400s without it), and there is no get-by-app single endpoint,
   * so the app id is the only lookup key.
   */
  readonly appId: string;
  readonly scope: ReadScope;
  readonly pageLimit?: ReviewSubmissionsQuery["limit"];
  readonly platform?: ReviewSubmissionsQuery["filter[platform]"];
  readonly state?: ReviewSubmissionsQuery["filter[state]"];
  readonly include?: ReviewSubmissionsQuery["include"];
  readonly fields?: ReviewSubmissionsQuery["fields[reviewSubmissions]"];
  readonly pagination?: PaginateOptions;
}

/** Reads an app's review submissions, under an explicit pagination scope. */
export function listReviewSubmissions(
  client: AscClient,
  options: ListReviewSubmissionsOptions,
): Promise<CollectedRead<ReviewSubmission>> {
  const query: ReviewSubmissionsQuery = {
    "filter[app]": [options.appId],
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.platform !== undefined && {
      "filter[platform]": options.platform,
    }),
    ...(options.state !== undefined && { "filter[state]": options.state }),
    ...(options.include !== undefined && { include: options.include }),
    ...(options.fields !== undefined && {
      "fields[reviewSubmissions]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/reviewSubmissions",
    { params: { query } },
    options.scope,
    options.pagination,
  );
}

export interface GetReviewSubmissionOptions {
  readonly include?: ReviewSubmissionInstanceQuery["include"];
  readonly fields?: ReviewSubmissionInstanceQuery["fields[reviewSubmissions]"];
  readonly itemFields?: ReviewSubmissionInstanceQuery["fields[reviewSubmissionItems]"];
}

/** Reads one review submission by ASC id (full response for include support). */
export async function getReviewSubmission(
  client: AscClient,
  submissionId: string,
  options: GetReviewSubmissionOptions = {},
): Promise<ReviewSubmissionResponse> {
  const query: ReviewSubmissionInstanceQuery = {
    ...(options.include !== undefined && { include: options.include }),
    ...(options.fields !== undefined && {
      "fields[reviewSubmissions]": options.fields,
    }),
    ...(options.itemFields !== undefined && {
      "fields[reviewSubmissionItems]": options.itemFields,
    }),
  };
  const { data } = await client.GET("/v1/reviewSubmissions/{id}", {
    params: { path: { id: submissionId }, query },
  });
  return expectDocument(data);
}

/**
 * Opens a review submission container for an app. The container is app+platform
 * scoped (it does NOT name a version); versions/experiments/etc. are attached
 * as items afterward. Apple allows up to 2 concurrent containers per platform,
 * so this is not globally unique — callers idempotency-key on whether the
 * target item is already in an unsubmitted container (see the assembly workflow).
 */
export async function createReviewSubmission(
  client: AscClient,
  appId: string,
  platform?: ReviewSubmissionPlatform,
): Promise<ReviewSubmissionResponse> {
  const { data } = await client.POST("/v1/reviewSubmissions", {
    body: {
      data: {
        type: "reviewSubmissions",
        ...(platform !== undefined && { attributes: { platform } }),
        relationships: {
          app: { data: { type: "apps", id: appId } },
        },
      },
    },
  });
  return expectDocument(data);
}

/**
 * Updates a review submission's `submitted`/`canceled` booleans. Setting
 * `submitted=true` starts the real App Review; `canceled=true` withdraws it.
 * `state` is server-derived and never written here. The caller is responsible
 * for gating these high side-effect writes (CLI --force layer).
 */
export async function updateReviewSubmission(
  client: AscClient,
  submissionId: string,
  attributes: ReviewSubmissionUpdateAttributes,
): Promise<ReviewSubmissionResponse> {
  const { data } = await client.PATCH("/v1/reviewSubmissions/{id}", {
    params: { path: { id: submissionId } },
    body: {
      data: { type: "reviewSubmissions", id: submissionId, attributes },
    },
  });
  return expectDocument(data);
}

// ---------------------------------------------------------------------------
// reviewSubmissionItems (the content attached to a container)
// ---------------------------------------------------------------------------

/**
 * The content relationships a submission item can carry. The contract permits
 * many (version / experiment / event / custom product page / background asset /
 * game-center variants); this phase only attaches `appStoreVersion`. The create
 * helper validates "exactly one content relationship" locally before any call.
 */
export interface ReviewSubmissionItemContent {
  readonly appStoreVersion?: string;
}

const CONTENT_RELATIONSHIP_KEYS: readonly (keyof ReviewSubmissionItemContent)[] =
  ["appStoreVersion"];

/**
 * Adds one content item to a review submission. Exactly one content
 * relationship must be supplied alongside the parent `reviewSubmission`; this
 * is validated LOCALLY (a CliUsageError-class error, exit 64) before any
 * network call, because the JSON:API shape allows zero-or-many but Apple
 * requires precisely one. This phase only supports the appStoreVersion content.
 */
export async function createReviewSubmissionItem(
  client: AscClient,
  reviewSubmissionId: string,
  content: ReviewSubmissionItemContent,
): Promise<ReviewSubmissionItemResponse> {
  const present = CONTENT_RELATIONSHIP_KEYS.filter(
    (key) => content[key] !== undefined,
  );
  if (present.length !== 1) {
    throw new AscInvalidParameterError(
      `A review submission item requires exactly one content relationship; got ${String(
        present.length,
      )} (${present.join(", ") || "none"}).`,
    );
  }
  const { data } = await client.POST("/v1/reviewSubmissionItems", {
    body: {
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: {
            data: { type: "reviewSubmissions", id: reviewSubmissionId },
          },
          ...(content.appStoreVersion !== undefined && {
            appStoreVersion: {
              data: {
                type: "appStoreVersions",
                id: content.appStoreVersion,
              },
            },
          }),
        },
      },
    },
  });
  return expectDocument(data);
}

/**
 * Updates a submission item's `removed`/`resolved` booleans (state is
 * read-only). `removed=true` detaches the item from an unsubmitted container.
 */
export async function updateReviewSubmissionItem(
  client: AscClient,
  itemId: string,
  attributes: ReviewSubmissionItemUpdateAttributes,
): Promise<ReviewSubmissionItemResponse> {
  const { data } = await client.PATCH("/v1/reviewSubmissionItems/{id}", {
    params: { path: { id: itemId } },
    body: {
      data: { type: "reviewSubmissionItems", id: itemId, attributes },
    },
  });
  return expectDocument(data);
}

/** Deletes a submission item (only valid while the container is unsubmitted). */
export async function deleteReviewSubmissionItem(
  client: AscClient,
  itemId: string,
): Promise<void> {
  await client.DELETE("/v1/reviewSubmissionItems/{id}", {
    params: { path: { id: itemId } },
  });
}

export interface ListReviewSubmissionItemsOptions {
  readonly scope: ReadScope;
  readonly pageLimit?: ReviewSubmissionItemsQuery["limit"];
  readonly include?: ReviewSubmissionItemsQuery["include"];
  readonly fields?: ReviewSubmissionItemsQuery["fields[reviewSubmissionItems]"];
  readonly pagination?: PaginateOptions;
}

/**
 * Reads a submission's items via the parent to-many related endpoint. There is
 * no top-level reviewSubmissionItems collection, so the parent id is the key.
 */
export function listReviewSubmissionItems(
  client: AscClient,
  reviewSubmissionId: string,
  options: ListReviewSubmissionItemsOptions,
): Promise<CollectedRead<ReviewSubmissionItem>> {
  const query: ReviewSubmissionItemsQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.include !== undefined && { include: options.include }),
    ...(options.fields !== undefined && {
      "fields[reviewSubmissionItems]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/reviewSubmissions/{id}/items",
    { params: { path: { id: reviewSubmissionId }, query } },
    options.scope,
    options.pagination,
  );
}
