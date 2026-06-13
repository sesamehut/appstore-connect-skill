// App Store preview (video) sets and previews.
//
// The deprecation note on app-screenshots.ts applies verbatim here: these are
// the only API path for store previews, marked `@deprecated` upstream but
// functional, and `@typescript-eslint/no-deprecated` is disabled for this file
// in eslint.config.js. Previews differ from screenshots in carrying a separate
// `videoDeliveryState` (video transcoding runs after the bytes land) plus the
// `mimeType` / `previewFrameTimeCode` attributes.

import type { components, operations } from "../generated/asc-openapi.js";
import type { AscClient } from "../http/client.js";
import { expectDocument } from "./internal.js";
import { readPaged } from "../pagination/paginate.js";
import type {
  CollectedRead,
  PaginateOptions,
  ReadScope,
} from "../pagination/paginate.js";

export type AppPreview = components["schemas"]["AppPreview"];
export type AppPreviewResponse = components["schemas"]["AppPreviewResponse"];
export type AppPreviewSet = components["schemas"]["AppPreviewSet"];
export type AppPreviewSetResponse =
  components["schemas"]["AppPreviewSetResponse"];
export type PreviewType = components["schemas"]["PreviewType"];

export type AppPreviewCreateAttributes =
  components["schemas"]["AppPreviewCreateRequest"]["data"]["attributes"];
export type AppPreviewUpdateAttributes = NonNullable<
  components["schemas"]["AppPreviewUpdateRequest"]["data"]["attributes"]
>;

type PreviewSetsQuery = NonNullable<
  operations["appStoreVersionLocalizations_appPreviewSets_getToManyRelated"]["parameters"]["query"]
>;
type PreviewsQuery = NonNullable<
  operations["appPreviewSets_appPreviews_getToManyRelated"]["parameters"]["query"]
>;

export interface ListAppPreviewSetsOptions {
  /** Read-cost declaration; always an explicit call-site decision. */
  readonly scope: ReadScope;
  readonly pageLimit?: PreviewSetsQuery["limit"];
  readonly fields?: PreviewSetsQuery["fields[appPreviewSets]"];
  readonly pagination?: PaginateOptions;
}

/** Reads a version localization's preview sets (one per preview type). */
export function listAppPreviewSets(
  client: AscClient,
  localizationId: string,
  options: ListAppPreviewSetsOptions,
): Promise<CollectedRead<AppPreviewSet>> {
  const query: PreviewSetsQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.fields !== undefined && {
      "fields[appPreviewSets]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/appStoreVersionLocalizations/{id}/appPreviewSets",
    { params: { path: { id: localizationId }, query } },
    options.scope,
    options.pagination,
  );
}

export interface ListAppPreviewsOptions {
  readonly scope: ReadScope;
  readonly pageLimit?: PreviewsQuery["limit"];
  readonly fields?: PreviewsQuery["fields[appPreviews]"];
  readonly pagination?: PaginateOptions;
}

/** Reads the previews in a set, in their stored display order. */
export function listAppPreviews(
  client: AscClient,
  setId: string,
  options: ListAppPreviewsOptions,
): Promise<CollectedRead<AppPreview>> {
  const query: PreviewsQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.fields !== undefined && {
      "fields[appPreviews]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/appPreviewSets/{id}/appPreviews",
    { params: { path: { id: setId }, query } },
    options.scope,
    options.pagination,
  );
}

/** Creates a preview set for a preview type on a version localization. */
export async function createAppPreviewSet(
  client: AscClient,
  localizationId: string,
  previewType: PreviewType,
): Promise<AppPreviewSetResponse> {
  const { data } = await client.POST("/v1/appPreviewSets", {
    body: {
      data: {
        type: "appPreviewSets",
        attributes: { previewType },
        relationships: {
          appStoreVersionLocalization: {
            data: { type: "appStoreVersionLocalizations", id: localizationId },
          },
        },
      },
    },
  });
  return expectDocument(data);
}

/** Deletes a preview set (and the previews it holds). */
export async function deleteAppPreviewSet(
  client: AscClient,
  setId: string,
): Promise<void> {
  await client.DELETE("/v1/appPreviewSets/{id}", {
    params: { path: { id: setId } },
  });
}

/**
 * Reserves a preview: the response carries the `uploadOperations` and an
 * `assetDeliveryState` starting at AWAITING_UPLOAD. `mimeType` and
 * `previewFrameTimeCode` are optional reservation inputs.
 */
export async function reserveAppPreview(
  client: AscClient,
  setId: string,
  attributes: AppPreviewCreateAttributes,
): Promise<AppPreviewResponse> {
  const { data } = await client.POST("/v1/appPreviews", {
    body: {
      data: {
        type: "appPreviews",
        attributes,
        relationships: {
          appPreviewSet: {
            data: { type: "appPreviewSets", id: setId },
          },
        },
      },
    },
  });
  return expectDocument(data);
}

/**
 * Reads one preview — the poll target for both `assetDeliveryState` (the byte
 * upload) and `videoDeliveryState` (the transcode that follows it).
 */
export async function getAppPreview(
  client: AscClient,
  previewId: string,
): Promise<AppPreviewResponse> {
  const { data } = await client.GET("/v1/appPreviews/{id}", {
    params: { path: { id: previewId } },
  });
  return expectDocument(data);
}

export type AppMediaAssetState = components["schemas"]["AppMediaAssetState"];
export type AppMediaVideoState = components["schemas"]["AppMediaVideoState"];

/**
 * The preview's two delivery states (byte upload + video transcode), read here
 * so the deprecated `assetDeliveryState` attribute access stays inside this
 * isolated file; the workflow layer classifies the returned states. Both must
 * reach COMPLETE before a preview is done.
 */
export function readPreviewDeliveryStates(resource: AppPreviewResponse): {
  readonly asset: AppMediaAssetState | undefined;
  readonly video: AppMediaVideoState | undefined;
} {
  const attributes = resource.data.attributes;
  return {
    asset: attributes?.assetDeliveryState,
    video: attributes?.videoDeliveryState,
  };
}

/**
 * Commits a reserved preview: `uploaded: true` plus the whole-file
 * `sourceFileChecksum` (MD5). `previewFrameTimeCode` may also be set here to
 * pick the poster frame.
 */
export async function commitAppPreview(
  client: AscClient,
  previewId: string,
  attributes: AppPreviewUpdateAttributes,
): Promise<AppPreviewResponse> {
  const { data } = await client.PATCH("/v1/appPreviews/{id}", {
    params: { path: { id: previewId } },
    body: {
      data: { type: "appPreviews", id: previewId, attributes },
    },
  });
  return expectDocument(data);
}

/** Deletes a preview. */
export async function deleteAppPreview(
  client: AscClient,
  previewId: string,
): Promise<void> {
  await client.DELETE("/v1/appPreviews/{id}", {
    params: { path: { id: previewId } },
  });
}

/**
 * Replaces a set's preview ordering. ASC requires the full membership in the
 * new order; a partial or superset list is rejected.
 */
export async function reorderAppPreviews(
  client: AscClient,
  setId: string,
  previewIds: readonly string[],
): Promise<void> {
  await client.PATCH("/v1/appPreviewSets/{id}/relationships/appPreviews", {
    params: { path: { id: setId } },
    body: {
      data: previewIds.map((id) => ({ type: "appPreviews" as const, id })),
    },
  });
}
