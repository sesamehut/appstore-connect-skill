import type { components, operations } from "../generated/asc-openapi.js";
import type { AscClient } from "../http/client.js";
import { readPaged } from "../pagination/paginate.js";
import type {
  CollectedRead,
  PaginateOptions,
  ReadScope,
} from "../pagination/paginate.js";

export type AppStoreVersion = components["schemas"]["AppStoreVersion"];

type VersionsQuery = NonNullable<
  operations["apps_appStoreVersions_getToManyRelated"]["parameters"]["query"]
>;

export interface ListAppStoreVersionsOptions {
  /** Read-cost declaration; always an explicit call-site decision. */
  readonly scope: ReadScope;
  /** Page size sent to ASC (`limit`, server-capped at 200). */
  readonly pageLimit?: VersionsQuery["limit"];
  readonly platform?: VersionsQuery["filter[platform]"];
  /** Current-state filter; the spec deprecates filter[appStoreState] for it. */
  readonly appVersionState?: VersionsQuery["filter[appVersionState]"];
  readonly versionString?: VersionsQuery["filter[versionString]"];
  readonly fields?: VersionsQuery["fields[appStoreVersions]"];
  readonly pagination?: PaginateOptions;
}

/** Reads an app's App Store versions, under an explicit pagination scope. */
export function listAppStoreVersions(
  client: AscClient,
  appId: string,
  options: ListAppStoreVersionsOptions,
): Promise<CollectedRead<AppStoreVersion>> {
  const query: VersionsQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.platform !== undefined && {
      "filter[platform]": options.platform,
    }),
    ...(options.appVersionState !== undefined && {
      "filter[appVersionState]": options.appVersionState,
    }),
    ...(options.versionString !== undefined && {
      "filter[versionString]": options.versionString,
    }),
    ...(options.fields !== undefined && {
      "fields[appStoreVersions]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/apps/{id}/appStoreVersions",
    { params: { path: { id: appId }, query } },
    options.scope,
    options.pagination,
  );
}
