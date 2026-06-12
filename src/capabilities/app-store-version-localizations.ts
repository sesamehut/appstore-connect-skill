import type { components, operations } from "../generated/asc-openapi.js";
import type { AscClient } from "../http/client.js";
import { expectDocument } from "./internal.js";
import { readPaged } from "../pagination/paginate.js";
import type {
  CollectedRead,
  PaginateOptions,
  ReadScope,
} from "../pagination/paginate.js";

export type AppStoreVersionLocalization =
  components["schemas"]["AppStoreVersionLocalization"];
export type AppStoreVersionLocalizationResponse =
  components["schemas"]["AppStoreVersionLocalizationResponse"];

// Write inputs derive from the generated *request* schemas, not the resource
// schema: only the request types carry Apple's tri-state update semantics
// (omitted = unchanged, null = clear, string = set) in their optionality.
export type AppStoreVersionLocalizationCreateAttributes =
  components["schemas"]["AppStoreVersionLocalizationCreateRequest"]["data"]["attributes"];
export type AppStoreVersionLocalizationUpdateAttributes = NonNullable<
  components["schemas"]["AppStoreVersionLocalizationUpdateRequest"]["data"]["attributes"]
>;

type VersionLocalizationsQuery = NonNullable<
  operations["appStoreVersions_appStoreVersionLocalizations_getToManyRelated"]["parameters"]["query"]
>;
type VersionLocalizationInstanceQuery = NonNullable<
  operations["appStoreVersionLocalizations_getInstance"]["parameters"]["query"]
>;

export interface ListAppStoreVersionLocalizationsOptions {
  /** Read-cost declaration; always an explicit call-site decision. */
  readonly scope: ReadScope;
  /** Page size sent to ASC (`limit`, server-capped at 200). */
  readonly pageLimit?: VersionLocalizationsQuery["limit"];
  readonly locale?: VersionLocalizationsQuery["filter[locale]"];
  readonly fields?: VersionLocalizationsQuery["fields[appStoreVersionLocalizations]"];
  readonly pagination?: PaginateOptions;
}

/**
 * Reads a version's localizations, under an explicit pagination scope.
 *
 * `include` is deliberately not exposed on list reads: the pagination
 * collector keeps only `data`, so included resources would be dropped
 * silently. Use the instance read when related resources are needed.
 */
export function listAppStoreVersionLocalizations(
  client: AscClient,
  versionId: string,
  options: ListAppStoreVersionLocalizationsOptions,
): Promise<CollectedRead<AppStoreVersionLocalization>> {
  const query: VersionLocalizationsQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.locale !== undefined && { "filter[locale]": options.locale }),
    ...(options.fields !== undefined && {
      "fields[appStoreVersionLocalizations]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/appStoreVersions/{id}/appStoreVersionLocalizations",
    { params: { path: { id: versionId }, query } },
    options.scope,
    options.pagination,
  );
}

export interface GetAppStoreVersionLocalizationOptions {
  readonly fields?: VersionLocalizationInstanceQuery["fields[appStoreVersionLocalizations]"];
}

/** Reads one version localization by its ASC id, as the full document. */
export async function getAppStoreVersionLocalization(
  client: AscClient,
  localizationId: string,
  options: GetAppStoreVersionLocalizationOptions = {},
): Promise<AppStoreVersionLocalizationResponse> {
  const query: VersionLocalizationInstanceQuery = {
    ...(options.fields !== undefined && {
      "fields[appStoreVersionLocalizations]": options.fields,
    }),
  };
  const { data } = await client.GET("/v1/appStoreVersionLocalizations/{id}", {
    params: { path: { id: localizationId }, query },
  });
  return expectDocument(data);
}

/**
 * Adds a language to a version. `attributes.locale` is required; the version
 * must be in an editable state or ASC rejects the create as a parameter
 * error. `whatsNew` is rejected on an app's first-ever version.
 */
export async function createAppStoreVersionLocalization(
  client: AscClient,
  versionId: string,
  attributes: AppStoreVersionLocalizationCreateAttributes,
): Promise<AppStoreVersionLocalizationResponse> {
  const { data } = await client.POST("/v1/appStoreVersionLocalizations", {
    body: {
      data: {
        type: "appStoreVersionLocalizations",
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
 * Patches localization copy. Omitted attributes stay unchanged and `null`
 * clears a field (JSON:API tri-state). Most fields are writable only while
 * the version is in an editable state; `promotionalText` is writable in any
 * state without triggering a new review. Out-of-state writes surface as
 * normalized ASC parameter errors — there is no client-side matrix to check
 * against, by design.
 */
export async function updateAppStoreVersionLocalization(
  client: AscClient,
  localizationId: string,
  attributes: AppStoreVersionLocalizationUpdateAttributes,
): Promise<AppStoreVersionLocalizationResponse> {
  const { data } = await client.PATCH("/v1/appStoreVersionLocalizations/{id}", {
    params: { path: { id: localizationId } },
    body: {
      data: {
        type: "appStoreVersionLocalizations",
        id: localizationId,
        attributes,
      },
    },
  });
  return expectDocument(data);
}
