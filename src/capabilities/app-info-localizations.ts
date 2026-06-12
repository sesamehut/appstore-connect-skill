import type { components, operations } from "../generated/asc-openapi.js";
import type { AscClient } from "../http/client.js";
import { expectDocument } from "./internal.js";
import { readPaged } from "../pagination/paginate.js";
import type {
  CollectedRead,
  PaginateOptions,
  ReadScope,
} from "../pagination/paginate.js";

export type AppInfoLocalization = components["schemas"]["AppInfoLocalization"];
export type AppInfoLocalizationResponse =
  components["schemas"]["AppInfoLocalizationResponse"];

// Write inputs derive from the generated *request* schemas, not the resource
// schema: only the request types carry Apple's tri-state update semantics
// (omitted = unchanged, null = clear, string = set) in their optionality.
export type AppInfoLocalizationCreateAttributes =
  components["schemas"]["AppInfoLocalizationCreateRequest"]["data"]["attributes"];
export type AppInfoLocalizationUpdateAttributes = NonNullable<
  components["schemas"]["AppInfoLocalizationUpdateRequest"]["data"]["attributes"]
>;

type AppInfoLocalizationsQuery = NonNullable<
  operations["appInfos_appInfoLocalizations_getToManyRelated"]["parameters"]["query"]
>;
type AppInfoLocalizationInstanceQuery = NonNullable<
  operations["appInfoLocalizations_getInstance"]["parameters"]["query"]
>;

export interface ListAppInfoLocalizationsOptions {
  /** Read-cost declaration; always an explicit call-site decision. */
  readonly scope: ReadScope;
  /** Page size sent to ASC (`limit`, server-capped at 200). */
  readonly pageLimit?: AppInfoLocalizationsQuery["limit"];
  readonly locale?: AppInfoLocalizationsQuery["filter[locale]"];
  readonly fields?: AppInfoLocalizationsQuery["fields[appInfoLocalizations]"];
  readonly pagination?: PaginateOptions;
}

/**
 * Reads an appInfo's localizations, under an explicit pagination scope.
 *
 * `include` is deliberately not exposed on list reads: the pagination
 * collector keeps only `data`, so included resources would be dropped
 * silently. Use the instance read when related resources are needed.
 */
export function listAppInfoLocalizations(
  client: AscClient,
  appInfoId: string,
  options: ListAppInfoLocalizationsOptions,
): Promise<CollectedRead<AppInfoLocalization>> {
  const query: AppInfoLocalizationsQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.locale !== undefined && { "filter[locale]": options.locale }),
    ...(options.fields !== undefined && {
      "fields[appInfoLocalizations]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/appInfos/{id}/appInfoLocalizations",
    { params: { path: { id: appInfoId }, query } },
    options.scope,
    options.pagination,
  );
}

export interface GetAppInfoLocalizationOptions {
  readonly fields?: AppInfoLocalizationInstanceQuery["fields[appInfoLocalizations]"];
}

/** Reads one app-level localization by its ASC id, as the full document. */
export async function getAppInfoLocalization(
  client: AscClient,
  localizationId: string,
  options: GetAppInfoLocalizationOptions = {},
): Promise<AppInfoLocalizationResponse> {
  const query: AppInfoLocalizationInstanceQuery = {
    ...(options.fields !== undefined && {
      "fields[appInfoLocalizations]": options.fields,
    }),
  };
  const { data } = await client.GET("/v1/appInfoLocalizations/{id}", {
    params: { path: { id: localizationId }, query },
  });
  return expectDocument(data);
}

/**
 * Adds a language to an appInfo. `attributes.locale` and `.name` are
 * required. The target must be the editable appInfo (pick it by `state` via
 * listAppInfos); writing to the live one surfaces as a normalized ASC
 * parameter error.
 */
export async function createAppInfoLocalization(
  client: AscClient,
  appInfoId: string,
  attributes: AppInfoLocalizationCreateAttributes,
): Promise<AppInfoLocalizationResponse> {
  const { data } = await client.POST("/v1/appInfoLocalizations", {
    body: {
      data: {
        type: "appInfoLocalizations",
        attributes,
        relationships: {
          appInfo: {
            data: { type: "appInfos", id: appInfoId },
          },
        },
      },
    },
  });
  return expectDocument(data);
}

/**
 * Patches app-level copy (name, subtitle, privacy URLs). Omitted attributes
 * stay unchanged and `null` clears a field (JSON:API tri-state). The target
 * must belong to the editable appInfo; out-of-state writes surface as
 * normalized ASC parameter errors.
 */
export async function updateAppInfoLocalization(
  client: AscClient,
  localizationId: string,
  attributes: AppInfoLocalizationUpdateAttributes,
): Promise<AppInfoLocalizationResponse> {
  const { data } = await client.PATCH("/v1/appInfoLocalizations/{id}", {
    params: { path: { id: localizationId } },
    body: {
      data: {
        type: "appInfoLocalizations",
        id: localizationId,
        attributes,
      },
    },
  });
  return expectDocument(data);
}
