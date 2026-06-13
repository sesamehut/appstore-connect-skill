// App Store screenshot sets and screenshots.
//
// Apple marks every screenshot/preview endpoint `@deprecated` in the current
// spec, yet they remain the ONLY API path for store media and still function
// (the newer multipart upload model covers build/background-asset uploads
// only). Per docs/phases/m6-media-workflows.md the dependency on these
// deprecated resources is confined to this capability file and its preview
// twin; `@typescript-eslint/no-deprecated` is therefore disabled here in
// eslint.config.js. Everything above this layer speaks in the local type
// aliases below, which are not themselves deprecated.

import type { components, operations } from "../generated/asc-openapi.js";
import type { AscClient } from "../http/client.js";
import { expectDocument } from "./internal.js";
import { readPaged } from "../pagination/paginate.js";
import type {
  CollectedRead,
  PaginateOptions,
  ReadScope,
} from "../pagination/paginate.js";

export type AppScreenshot = components["schemas"]["AppScreenshot"];
export type AppScreenshotResponse =
  components["schemas"]["AppScreenshotResponse"];
export type AppScreenshotSet = components["schemas"]["AppScreenshotSet"];
export type AppScreenshotSetResponse =
  components["schemas"]["AppScreenshotSetResponse"];
export type ScreenshotDisplayType =
  components["schemas"]["ScreenshotDisplayType"];

export type AppScreenshotCreateAttributes =
  components["schemas"]["AppScreenshotCreateRequest"]["data"]["attributes"];
export type AppScreenshotUpdateAttributes = NonNullable<
  components["schemas"]["AppScreenshotUpdateRequest"]["data"]["attributes"]
>;

type ScreenshotSetsQuery = NonNullable<
  operations["appStoreVersionLocalizations_appScreenshotSets_getToManyRelated"]["parameters"]["query"]
>;
type ScreenshotsQuery = NonNullable<
  operations["appScreenshotSets_appScreenshots_getToManyRelated"]["parameters"]["query"]
>;

export interface ListAppScreenshotSetsOptions {
  /** Read-cost declaration; always an explicit call-site decision. */
  readonly scope: ReadScope;
  readonly pageLimit?: ScreenshotSetsQuery["limit"];
  readonly fields?: ScreenshotSetsQuery["fields[appScreenshotSets]"];
  readonly pagination?: PaginateOptions;
}

/** Reads a version localization's screenshot sets (one per display type). */
export function listAppScreenshotSets(
  client: AscClient,
  localizationId: string,
  options: ListAppScreenshotSetsOptions,
): Promise<CollectedRead<AppScreenshotSet>> {
  const query: ScreenshotSetsQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.fields !== undefined && {
      "fields[appScreenshotSets]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/appStoreVersionLocalizations/{id}/appScreenshotSets",
    { params: { path: { id: localizationId }, query } },
    options.scope,
    options.pagination,
  );
}

export interface ListAppScreenshotsOptions {
  readonly scope: ReadScope;
  readonly pageLimit?: ScreenshotsQuery["limit"];
  readonly fields?: ScreenshotsQuery["fields[appScreenshots]"];
  readonly pagination?: PaginateOptions;
}

/** Reads the screenshots in a set, in their stored display order. */
export function listAppScreenshots(
  client: AscClient,
  setId: string,
  options: ListAppScreenshotsOptions,
): Promise<CollectedRead<AppScreenshot>> {
  const query: ScreenshotsQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.fields !== undefined && {
      "fields[appScreenshots]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/appScreenshotSets/{id}/appScreenshots",
    { params: { path: { id: setId }, query } },
    options.scope,
    options.pagination,
  );
}

/** Creates a screenshot set for a display type on a version localization. */
export async function createAppScreenshotSet(
  client: AscClient,
  localizationId: string,
  screenshotDisplayType: ScreenshotDisplayType,
): Promise<AppScreenshotSetResponse> {
  const { data } = await client.POST("/v1/appScreenshotSets", {
    body: {
      data: {
        type: "appScreenshotSets",
        attributes: { screenshotDisplayType },
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

/** Deletes a screenshot set (and the screenshots it holds). */
export async function deleteAppScreenshotSet(
  client: AscClient,
  setId: string,
): Promise<void> {
  await client.DELETE("/v1/appScreenshotSets/{id}", {
    params: { path: { id: setId } },
  });
}

/**
 * Reserves a screenshot: the response carries the `uploadOperations` (where to
 * PUT the bytes) and an `assetDeliveryState` starting at AWAITING_UPLOAD.
 */
export async function reserveAppScreenshot(
  client: AscClient,
  setId: string,
  attributes: AppScreenshotCreateAttributes,
): Promise<AppScreenshotResponse> {
  const { data } = await client.POST("/v1/appScreenshots", {
    body: {
      data: {
        type: "appScreenshots",
        attributes,
        relationships: {
          appScreenshotSet: {
            data: { type: "appScreenshotSets", id: setId },
          },
        },
      },
    },
  });
  return expectDocument(data);
}

/** Reads one screenshot — the poll target for `assetDeliveryState`. */
export async function getAppScreenshot(
  client: AscClient,
  screenshotId: string,
): Promise<AppScreenshotResponse> {
  const { data } = await client.GET("/v1/appScreenshots/{id}", {
    params: { path: { id: screenshotId } },
  });
  return expectDocument(data);
}

export type AppMediaAssetState = components["schemas"]["AppMediaAssetState"];

/**
 * The screenshot's delivery state (the upload/processing poll target), read
 * here so the deprecated-attribute access stays inside this isolated file; the
 * workflow layer classifies the returned non-deprecated state instead.
 */
export function readScreenshotDeliveryState(
  resource: AppScreenshotResponse,
): AppMediaAssetState | undefined {
  return resource.data.attributes?.assetDeliveryState;
}

/**
 * Commits a reserved screenshot: `uploaded: true` plus the whole-file
 * `sourceFileChecksum` (MD5) tells Apple every byte landed and to begin
 * processing the asset.
 */
export async function commitAppScreenshot(
  client: AscClient,
  screenshotId: string,
  attributes: AppScreenshotUpdateAttributes,
): Promise<AppScreenshotResponse> {
  const { data } = await client.PATCH("/v1/appScreenshots/{id}", {
    params: { path: { id: screenshotId } },
    body: {
      data: { type: "appScreenshots", id: screenshotId, attributes },
    },
  });
  return expectDocument(data);
}

/** Deletes a screenshot. */
export async function deleteAppScreenshot(
  client: AscClient,
  screenshotId: string,
): Promise<void> {
  await client.DELETE("/v1/appScreenshots/{id}", {
    params: { path: { id: screenshotId } },
  });
}

/**
 * Replaces a set's screenshot ordering. ASC requires the full membership in
 * the new order; a partial or superset list is rejected.
 */
export async function reorderAppScreenshots(
  client: AscClient,
  setId: string,
  screenshotIds: readonly string[],
): Promise<void> {
  await client.PATCH(
    "/v1/appScreenshotSets/{id}/relationships/appScreenshots",
    {
      params: { path: { id: setId } },
      body: {
        data: screenshotIds.map((id) => ({
          type: "appScreenshots" as const,
          id,
        })),
      },
    },
  );
}
