import type { components, operations } from "../generated/asc-openapi.js";
import type { AscClient } from "../http/client.js";
import { expectDocument } from "./internal.js";
import { readPaged } from "../pagination/paginate.js";
import type {
  CollectedRead,
  PaginateOptions,
  ReadScope,
} from "../pagination/paginate.js";

export type AppInfo = components["schemas"]["AppInfo"];
export type AppInfoResponse = components["schemas"]["AppInfoResponse"];

// Option types derive from the generated operations so contract upgrades
// flow through the capability surface instead of drifting from it.
type AppInfosQuery = NonNullable<
  operations["apps_appInfos_getToManyRelated"]["parameters"]["query"]
>;
type AppInfoInstanceQuery = NonNullable<
  operations["appInfos_getInstance"]["parameters"]["query"]
>;

export interface ListAppInfosOptions {
  /** Read-cost declaration; always an explicit call-site decision. */
  readonly scope: ReadScope;
  /** Page size sent to ASC (`limit`, server-capped at 200). */
  readonly pageLimit?: AppInfosQuery["limit"];
  readonly fields?: AppInfosQuery["fields[appInfos]"];
  readonly pagination?: PaginateOptions;
}

/**
 * Reads an app's appInfos — typically two: the live one and the editable
 * draft. `state` is the discriminator callers use to pick the editable one
 * before writing app-level localizations.
 *
 * The contract's PATCH for appInfos carries category relationships only (no
 * textual attributes), so this module stays read-only; app-level copy is
 * written through appInfoLocalizations.
 */
export function listAppInfos(
  client: AscClient,
  appId: string,
  options: ListAppInfosOptions,
): Promise<CollectedRead<AppInfo>> {
  const query: AppInfosQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.fields !== undefined && { "fields[appInfos]": options.fields }),
  };
  return readPaged(
    client,
    "/v1/apps/{id}/appInfos",
    { params: { path: { id: appId }, query } },
    options.scope,
    options.pagination,
  );
}

export interface GetAppInfoOptions {
  readonly fields?: AppInfoInstanceQuery["fields[appInfos]"];
  readonly include?: AppInfoInstanceQuery["include"];
  /** Field selection for included appInfoLocalizations (with `include`). */
  readonly localizationFields?: AppInfoInstanceQuery["fields[appInfoLocalizations]"];
}

/**
 * Reads one appInfo by its ASC id. Returns the full response document so
 * `include` relationships arrive intact in `included`.
 */
export async function getAppInfo(
  client: AscClient,
  appInfoId: string,
  options: GetAppInfoOptions = {},
): Promise<AppInfoResponse> {
  const query: AppInfoInstanceQuery = {
    ...(options.fields !== undefined && { "fields[appInfos]": options.fields }),
    ...(options.include !== undefined && { include: options.include }),
    ...(options.localizationFields !== undefined && {
      "fields[appInfoLocalizations]": options.localizationFields,
    }),
  };
  const { data } = await client.GET("/v1/appInfos/{id}", {
    params: { path: { id: appInfoId }, query },
  });
  return expectDocument(data);
}
