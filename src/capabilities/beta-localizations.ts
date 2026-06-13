import type { components, operations } from "../generated/asc-openapi.js";
import type { AscClient } from "../http/client.js";
import { expectDocument } from "./internal.js";
import { readPaged } from "../pagination/paginate.js";
import type {
  CollectedRead,
  PaginateOptions,
  ReadScope,
} from "../pagination/paginate.js";

export type BetaBuildLocalization =
  components["schemas"]["BetaBuildLocalization"];
export type BetaBuildLocalizationResponse =
  components["schemas"]["BetaBuildLocalizationResponse"];
export type BetaAppLocalization = components["schemas"]["BetaAppLocalization"];
export type BetaAppLocalizationResponse =
  components["schemas"]["BetaAppLocalizationResponse"];

/** "What to test" notes; locale + whatsNew are the only build-localization fields. */
export type BetaBuildLocalizationCreateAttributes =
  components["schemas"]["BetaBuildLocalizationCreateRequest"]["data"]["attributes"];
export type BetaBuildLocalizationUpdateAttributes = NonNullable<
  components["schemas"]["BetaBuildLocalizationUpdateRequest"]["data"]["attributes"]
>;
export type BetaAppLocalizationCreateAttributes =
  components["schemas"]["BetaAppLocalizationCreateRequest"]["data"]["attributes"];
export type BetaAppLocalizationUpdateAttributes = NonNullable<
  components["schemas"]["BetaAppLocalizationUpdateRequest"]["data"]["attributes"]
>;

type BuildLocalizationsQuery = NonNullable<
  operations["betaBuildLocalizations_getCollection"]["parameters"]["query"]
>;
type AppLocalizationsQuery = NonNullable<
  operations["betaAppLocalizations_getCollection"]["parameters"]["query"]
>;

// ---------------------------------------------------------------------------
// Beta build localizations ("what to test" notes, per build per locale)
// ---------------------------------------------------------------------------

export interface ListBetaBuildLocalizationsOptions {
  /** Read-cost declaration; always an explicit call-site decision. */
  readonly scope: ReadScope;
  readonly pageLimit?: BuildLocalizationsQuery["limit"];
  readonly build?: BuildLocalizationsQuery["filter[build]"];
  readonly locale?: BuildLocalizationsQuery["filter[locale]"];
  readonly fields?: BuildLocalizationsQuery["fields[betaBuildLocalizations]"];
  readonly pagination?: PaginateOptions;
}

/** Reads beta build localizations, filterable by build and/or locale. */
export function listBetaBuildLocalizations(
  client: AscClient,
  options: ListBetaBuildLocalizationsOptions,
): Promise<CollectedRead<BetaBuildLocalization>> {
  const query: BuildLocalizationsQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.build !== undefined && { "filter[build]": options.build }),
    ...(options.locale !== undefined && { "filter[locale]": options.locale }),
    ...(options.fields !== undefined && {
      "fields[betaBuildLocalizations]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/betaBuildLocalizations",
    { params: { query } },
    options.scope,
    options.pagination,
  );
}

/** Creates a beta build localization for a build + locale. */
export async function createBetaBuildLocalization(
  client: AscClient,
  buildId: string,
  attributes: BetaBuildLocalizationCreateAttributes,
): Promise<BetaBuildLocalizationResponse> {
  const { data } = await client.POST("/v1/betaBuildLocalizations", {
    body: {
      data: {
        type: "betaBuildLocalizations",
        attributes,
        relationships: {
          build: { data: { type: "builds", id: buildId } },
        },
      },
    },
  });
  return expectDocument(data);
}

/** Updates a beta build localization's whatsNew (locale is immutable on update). */
export async function updateBetaBuildLocalization(
  client: AscClient,
  localizationId: string,
  attributes: BetaBuildLocalizationUpdateAttributes,
): Promise<BetaBuildLocalizationResponse> {
  const { data } = await client.PATCH("/v1/betaBuildLocalizations/{id}", {
    params: { path: { id: localizationId } },
    body: {
      data: {
        type: "betaBuildLocalizations",
        id: localizationId,
        attributes,
      },
    },
  });
  return expectDocument(data);
}

/** Deletes a beta build localization. */
export async function deleteBetaBuildLocalization(
  client: AscClient,
  localizationId: string,
): Promise<void> {
  await client.DELETE("/v1/betaBuildLocalizations/{id}", {
    params: { path: { id: localizationId } },
  });
}

// ---------------------------------------------------------------------------
// Beta app localizations (app-level TestFlight metadata, per locale)
// ---------------------------------------------------------------------------

export interface ListBetaAppLocalizationsOptions {
  readonly scope: ReadScope;
  readonly pageLimit?: AppLocalizationsQuery["limit"];
  readonly app?: AppLocalizationsQuery["filter[app]"];
  readonly locale?: AppLocalizationsQuery["filter[locale]"];
  readonly fields?: AppLocalizationsQuery["fields[betaAppLocalizations]"];
  readonly pagination?: PaginateOptions;
}

/** Reads beta app localizations, filterable by app and/or locale. */
export function listBetaAppLocalizations(
  client: AscClient,
  options: ListBetaAppLocalizationsOptions,
): Promise<CollectedRead<BetaAppLocalization>> {
  const query: AppLocalizationsQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.app !== undefined && { "filter[app]": options.app }),
    ...(options.locale !== undefined && { "filter[locale]": options.locale }),
    ...(options.fields !== undefined && {
      "fields[betaAppLocalizations]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/betaAppLocalizations",
    { params: { query } },
    options.scope,
    options.pagination,
  );
}

/** Creates a beta app localization for an app + locale. */
export async function createBetaAppLocalization(
  client: AscClient,
  appId: string,
  attributes: BetaAppLocalizationCreateAttributes,
): Promise<BetaAppLocalizationResponse> {
  const { data } = await client.POST("/v1/betaAppLocalizations", {
    body: {
      data: {
        type: "betaAppLocalizations",
        attributes,
        relationships: {
          app: { data: { type: "apps", id: appId } },
        },
      },
    },
  });
  return expectDocument(data);
}

/** Updates a beta app localization's mutable fields (locale is immutable). */
export async function updateBetaAppLocalization(
  client: AscClient,
  localizationId: string,
  attributes: BetaAppLocalizationUpdateAttributes,
): Promise<BetaAppLocalizationResponse> {
  const { data } = await client.PATCH("/v1/betaAppLocalizations/{id}", {
    params: { path: { id: localizationId } },
    body: {
      data: { type: "betaAppLocalizations", id: localizationId, attributes },
    },
  });
  return expectDocument(data);
}

/** Deletes a beta app localization. */
export async function deleteBetaAppLocalization(
  client: AscClient,
  localizationId: string,
): Promise<void> {
  await client.DELETE("/v1/betaAppLocalizations/{id}", {
    params: { path: { id: localizationId } },
  });
}
