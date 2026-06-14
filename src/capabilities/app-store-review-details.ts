import type { components } from "../generated/asc-openapi.js";
import { AscNotFoundError } from "../errors.js";
import type { AscClient } from "../http/client.js";
import { expectDocument } from "./internal.js";

export type AppStoreReviewDetail =
  components["schemas"]["AppStoreReviewDetail"];
export type AppStoreReviewDetailResponse =
  components["schemas"]["AppStoreReviewDetailResponse"];

// Write inputs derive from the *request* schemas so the create/update surfaces
// carry the contract's optionality (omit = leave, null = clear). Attachments
// are intentionally excluded (decision G2): only contact/demo/notes fields.
export type AppStoreReviewDetailCreateAttributes = NonNullable<
  components["schemas"]["AppStoreReviewDetailCreateRequest"]["data"]["attributes"]
>;
export type AppStoreReviewDetailUpdateAttributes = NonNullable<
  components["schemas"]["AppStoreReviewDetailUpdateRequest"]["data"]["attributes"]
>;

/**
 * Reads a version's App Store review detail via the version-side to-one related
 * endpoint, returning undefined when none exists yet. Apple returns
 * `{ data: null }` for an absent to-one relationship; the response type pins
 * `data` as non-null, so the null is narrowed here (mirrors the recruitment
 * criterion read). live-verify (实机核实 #6): whether every version auto-has a
 * readable detail before any submission, or it appears only after a review
 * context exists — handled defensively as undefined here.
 */
export async function findAppStoreReviewDetail(
  client: AscClient,
  versionId: string,
): Promise<AppStoreReviewDetail | undefined> {
  const { data } = await client.GET(
    "/v1/appStoreVersions/{id}/appStoreReviewDetail",
    { params: { path: { id: versionId } } },
  );
  const document = expectDocument(data);
  const resource = document.data as AppStoreReviewDetail | null;
  return resource ?? undefined;
}

/**
 * Reads a version's App Store review detail or throws AscNotFoundError when the
 * version has none — the strict read for "show me the detail" callers.
 */
export async function getAppStoreReviewDetail(
  client: AscClient,
  versionId: string,
): Promise<AppStoreReviewDetail> {
  const detail = await findAppStoreReviewDetail(client, versionId);
  if (detail === undefined) {
    throw new AscNotFoundError(
      `App Store version ${versionId} has no review detail yet.`,
    );
  }
  return detail;
}

/**
 * Creates a version's App Store review detail (contact / demo account / notes).
 * Used by the find-or-create "set" path when no detail exists yet; carries the
 * appStoreVersion relationship the create requires.
 */
export async function createAppStoreReviewDetail(
  client: AscClient,
  versionId: string,
  attributes: AppStoreReviewDetailCreateAttributes,
): Promise<AppStoreReviewDetailResponse> {
  const { data } = await client.POST("/v1/appStoreReviewDetails", {
    body: {
      data: {
        type: "appStoreReviewDetails",
        attributes,
        relationships: {
          appStoreVersion: {
            data: { type: "appStoreVersions", id: versionId },
          },
        },
      },
    },
  });
  return expectDocument(data);
}

/**
 * Updates an existing App Store review detail by its own id (resolve it first
 * via findAppStoreReviewDetail). Takes the detail id, not the version id.
 */
export async function updateAppStoreReviewDetail(
  client: AscClient,
  detailId: string,
  attributes: AppStoreReviewDetailUpdateAttributes,
): Promise<AppStoreReviewDetailResponse> {
  const { data } = await client.PATCH("/v1/appStoreReviewDetails/{id}", {
    params: { path: { id: detailId } },
    body: {
      data: { type: "appStoreReviewDetails", id: detailId, attributes },
    },
  });
  return expectDocument(data);
}
