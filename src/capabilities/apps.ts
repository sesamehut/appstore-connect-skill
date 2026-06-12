import type { components, operations } from "../generated/asc-openapi.js";
import type { AscClient } from "../http/client.js";
import { expectDocument } from "./internal.js";
import { readPaged } from "../pagination/paginate.js";
import type {
  CollectedRead,
  PaginateOptions,
  ReadScope,
} from "../pagination/paginate.js";

export type App = components["schemas"]["App"];
export type AppResponse = components["schemas"]["AppResponse"];

// Option types derive from the generated operations so contract upgrades
// flow through the capability surface instead of drifting from it.
type AppsCollectionQuery = NonNullable<
  operations["apps_getCollection"]["parameters"]["query"]
>;
type AppInstanceQuery = NonNullable<
  operations["apps_getInstance"]["parameters"]["query"]
>;

export interface ListAppsOptions {
  /** Read-cost declaration; always an explicit call-site decision. */
  readonly scope: ReadScope;
  /** Page size sent to ASC (`limit`, server-capped at 200). */
  readonly pageLimit?: AppsCollectionQuery["limit"];
  readonly bundleId?: AppsCollectionQuery["filter[bundleId]"];
  readonly name?: AppsCollectionQuery["filter[name]"];
  readonly sku?: AppsCollectionQuery["filter[sku]"];
  readonly fields?: AppsCollectionQuery["fields[apps]"];
  readonly sort?: AppsCollectionQuery["sort"];
  readonly pagination?: PaginateOptions;
}

/** Reads the apps visible to the key, under an explicit pagination scope. */
export function listApps(
  client: AscClient,
  options: ListAppsOptions,
): Promise<CollectedRead<App>> {
  const query: AppsCollectionQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.bundleId !== undefined && {
      "filter[bundleId]": options.bundleId,
    }),
    ...(options.name !== undefined && { "filter[name]": options.name }),
    ...(options.sku !== undefined && { "filter[sku]": options.sku }),
    ...(options.fields !== undefined && { "fields[apps]": options.fields }),
    ...(options.sort !== undefined && { sort: options.sort }),
  };
  return readPaged(
    client,
    "/v1/apps",
    { params: { query } },
    options.scope,
    options.pagination,
  );
}

export interface GetAppOptions {
  readonly fields?: AppInstanceQuery["fields[apps]"];
}

/**
 * Reads one app by its ASC id. Returns the full response document (not the
 * bare resource) so M4 can add `include` support by extension, not reshaping.
 */
export async function getApp(
  client: AscClient,
  appId: string,
  options: GetAppOptions = {},
): Promise<AppResponse> {
  const query: AppInstanceQuery = {
    ...(options.fields !== undefined && { "fields[apps]": options.fields }),
  };
  const { data } = await client.GET("/v1/apps/{id}", {
    params: { path: { id: appId }, query },
  });
  return expectDocument(data);
}
