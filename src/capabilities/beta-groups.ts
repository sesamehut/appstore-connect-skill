import type { components, operations } from "../generated/asc-openapi.js";
import type { AscClient } from "../http/client.js";
import { expectDocument } from "./internal.js";
import { readPaged } from "../pagination/paginate.js";
import type {
  CollectedRead,
  PaginateOptions,
  ReadScope,
} from "../pagination/paginate.js";

export type BetaGroup = components["schemas"]["BetaGroup"];
export type BetaGroupResponse = components["schemas"]["BetaGroupResponse"];
export type BetaTester = components["schemas"]["BetaTester"];
export type Build = components["schemas"]["Build"];
export type BetaRecruitmentCriterion =
  components["schemas"]["BetaRecruitmentCriterion"];
export type BetaRecruitmentCriterionResponse =
  components["schemas"]["BetaRecruitmentCriterionResponse"];
export type BetaRecruitmentCriterionOption =
  components["schemas"]["BetaRecruitmentCriterionOption"];
export type BetaRecruitmentCriterionCompatibleBuildCheckResponse =
  components["schemas"]["BetaRecruitmentCriterionCompatibleBuildCheckResponse"];
export type DeviceFamilyOsVersionFilter =
  components["schemas"]["DeviceFamilyOsVersionFilter"];
export type DeviceFamily = components["schemas"]["DeviceFamily"];

/**
 * The create attributes Apple accepts on POST /betaGroups. `isInternalGroup`
 * and `hasAccessToAllBuilds` live here but NOT on the update request: they are
 * create-only (the group's internal/external nature and all-builds access are
 * fixed at creation), so callers must never round-trip them through an update.
 */
export type BetaGroupCreateAttributes =
  components["schemas"]["BetaGroupCreateRequest"]["data"]["attributes"];
export type BetaGroupUpdateAttributes = NonNullable<
  components["schemas"]["BetaGroupUpdateRequest"]["data"]["attributes"]
>;

type GroupsQuery = NonNullable<
  operations["betaGroups_getCollection"]["parameters"]["query"]
>;
type GroupInstanceQuery = NonNullable<
  operations["betaGroups_getInstance"]["parameters"]["query"]
>;
type GroupTestersQuery = NonNullable<
  operations["betaGroups_betaTesters_getToManyRelated"]["parameters"]["query"]
>;
type GroupBuildsQuery = NonNullable<
  operations["betaGroups_builds_getToManyRelated"]["parameters"]["query"]
>;
type CriteriaQuery = NonNullable<
  operations["betaGroups_betaRecruitmentCriteria_getToOneRelated"]["parameters"]["query"]
>;

export interface ListBetaGroupsOptions {
  /** Read-cost declaration; always an explicit call-site decision. */
  readonly scope: ReadScope;
  readonly pageLimit?: GroupsQuery["limit"];
  /** App id(s) to scope to, as ASC string filters. */
  readonly app?: GroupsQuery["filter[app]"];
  readonly name?: GroupsQuery["filter[name]"];
  /** "true"/"false" string filter on the create-only internal flag. */
  readonly isInternalGroup?: GroupsQuery["filter[isInternalGroup]"];
  readonly sort?: GroupsQuery["sort"];
  readonly fields?: GroupsQuery["fields[betaGroups]"];
  readonly pagination?: PaginateOptions;
}

/** Reads an account's beta groups, under an explicit pagination scope. */
export function listBetaGroups(
  client: AscClient,
  options: ListBetaGroupsOptions,
): Promise<CollectedRead<BetaGroup>> {
  const query: GroupsQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.app !== undefined && { "filter[app]": options.app }),
    ...(options.name !== undefined && { "filter[name]": options.name }),
    ...(options.isInternalGroup !== undefined && {
      "filter[isInternalGroup]": options.isInternalGroup,
    }),
    ...(options.sort !== undefined && { sort: options.sort }),
    ...(options.fields !== undefined && {
      "fields[betaGroups]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/betaGroups",
    { params: { query } },
    options.scope,
    options.pagination,
  );
}

export interface GetBetaGroupOptions {
  readonly fields?: GroupInstanceQuery["fields[betaGroups]"];
  readonly include?: GroupInstanceQuery["include"];
}

/** Reads one beta group by its ASC id, with optional related includes. */
export async function getBetaGroup(
  client: AscClient,
  groupId: string,
  options: GetBetaGroupOptions = {},
): Promise<BetaGroupResponse> {
  const query: GroupInstanceQuery = {
    ...(options.fields !== undefined && {
      "fields[betaGroups]": options.fields,
    }),
    ...(options.include !== undefined && { include: options.include }),
  };
  const { data } = await client.GET("/v1/betaGroups/{id}", {
    params: { path: { id: groupId }, query },
  });
  return expectDocument(data);
}

/**
 * Creates a beta group for an app. `isInternalGroup`/`hasAccessToAllBuilds`
 * are create-only and only settable here. Creating an external group with
 * testers attached emails real TestFlight invitations — a real side effect
 * the caller is responsible for gating.
 */
export async function createBetaGroup(
  client: AscClient,
  appId: string,
  attributes: BetaGroupCreateAttributes,
): Promise<BetaGroupResponse> {
  const { data } = await client.POST("/v1/betaGroups", {
    body: {
      data: {
        type: "betaGroups",
        attributes,
        relationships: {
          app: { data: { type: "apps", id: appId } },
        },
      },
    },
  });
  return expectDocument(data);
}

/**
 * Updates a beta group's mutable attributes. The update request type omits
 * `isInternalGroup`/`hasAccessToAllBuilds` by contract, so a caller cannot
 * accidentally try to flip a create-only field through this path.
 */
export async function updateBetaGroup(
  client: AscClient,
  groupId: string,
  attributes: BetaGroupUpdateAttributes,
): Promise<BetaGroupResponse> {
  const { data } = await client.PATCH("/v1/betaGroups/{id}", {
    params: { path: { id: groupId } },
    body: { data: { type: "betaGroups", id: groupId, attributes } },
  });
  return expectDocument(data);
}

/**
 * Deletes a beta group. Apple's cascade-vs-reject behavior for a non-empty
 * group is not yet confirmed; callers gate this behind a member read + force.
 */
export async function deleteBetaGroup(
  client: AscClient,
  groupId: string,
): Promise<void> {
  await client.DELETE("/v1/betaGroups/{id}", {
    params: { path: { id: groupId } },
  });
}

export interface ListGroupTestersOptions {
  readonly scope: ReadScope;
  readonly pageLimit?: GroupTestersQuery["limit"];
  readonly fields?: GroupTestersQuery["fields[betaTesters]"];
  readonly pagination?: PaginateOptions;
}

/** Reads the testers in a beta group (the canonical membership read). */
export function listGroupTesters(
  client: AscClient,
  groupId: string,
  options: ListGroupTestersOptions,
): Promise<CollectedRead<BetaTester>> {
  const query: GroupTestersQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.fields !== undefined && {
      "fields[betaTesters]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/betaGroups/{id}/betaTesters",
    { params: { path: { id: groupId }, query } },
    options.scope,
    options.pagination,
  );
}

/**
 * Adds testers to a group via the group-side relationship POST — the canonical
 * membership-edit end. This emails real TestFlight invitations to each tester;
 * a high side-effect write the caller is responsible for gating.
 */
export async function addTestersToGroup(
  client: AscClient,
  groupId: string,
  testerIds: readonly string[],
): Promise<void> {
  await client.POST("/v1/betaGroups/{id}/relationships/betaTesters", {
    params: { path: { id: groupId } },
    body: {
      data: testerIds.map((id) => ({ type: "betaTesters" as const, id })),
    },
  });
}

/** Removes testers from a group via the group-side relationship DELETE. */
export async function removeTestersFromGroup(
  client: AscClient,
  groupId: string,
  testerIds: readonly string[],
): Promise<void> {
  await client.DELETE("/v1/betaGroups/{id}/relationships/betaTesters", {
    params: { path: { id: groupId } },
    body: {
      data: testerIds.map((id) => ({ type: "betaTesters" as const, id })),
    },
  });
}

export interface ListGroupBuildsOptions {
  readonly scope: ReadScope;
  readonly pageLimit?: GroupBuildsQuery["limit"];
  readonly fields?: GroupBuildsQuery["fields[builds]"];
  readonly pagination?: PaginateOptions;
}

/**
 * Reads the builds distributed to a group — visibility only. Build-to-group
 * distribution is EDITED from the build side (assignBuildToBetaGroups); this
 * group-side read exists so a caller can see what a group can currently test.
 */
export function listGroupBuilds(
  client: AscClient,
  groupId: string,
  options: ListGroupBuildsOptions,
): Promise<CollectedRead<Build>> {
  const query: GroupBuildsQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.fields !== undefined && { "fields[builds]": options.fields }),
  };
  return readPaged(
    client,
    "/v1/betaGroups/{id}/builds",
    { params: { path: { id: groupId }, query } },
    options.scope,
    options.pagination,
  );
}

/**
 * Enables or disables a group's public link, optionally setting its install
 * limit. Enabling exposes the app for public external recruitment (no
 * per-person email, but a real external exposure) and only makes sense for
 * external groups. Modeled as a focused update so the public-link decision is
 * a distinct, auditable verb.
 */
export async function setPublicLink(
  client: AscClient,
  groupId: string,
  options: {
    readonly enabled: boolean;
    readonly limitEnabled?: boolean;
    readonly limit?: number;
  },
): Promise<BetaGroupResponse> {
  const attributes: BetaGroupUpdateAttributes = {
    publicLinkEnabled: options.enabled,
    ...(options.limitEnabled !== undefined && {
      publicLinkLimitEnabled: options.limitEnabled,
    }),
    ...(options.limit !== undefined && { publicLinkLimit: options.limit }),
  };
  return updateBetaGroup(client, groupId, attributes);
}

export interface ReadRecruitmentCriteriaOptions {
  readonly fields?: CriteriaQuery["fields[betaRecruitmentCriteria]"];
}

/**
 * Reads a group's current recruitment criteria via the group-side to-one
 * related endpoint. A group with no criteria configured can answer with a
 * null `data` (handled by the workflow layer's find-or-read).
 */
export async function readRecruitmentCriteria(
  client: AscClient,
  groupId: string,
  options: ReadRecruitmentCriteriaOptions = {},
): Promise<BetaRecruitmentCriterionResponse> {
  const query: CriteriaQuery = {
    ...(options.fields !== undefined && {
      "fields[betaRecruitmentCriteria]": options.fields,
    }),
  };
  const { data } = await client.GET(
    "/v1/betaGroups/{id}/betaRecruitmentCriteria",
    { params: { path: { id: groupId }, query } },
  );
  return expectDocument(data);
}

/**
 * Sets a group's recruitment criteria. The criterion is a per-group singleton:
 * Apple has no PATCH-by-group, so the criterion id (read first) is required to
 * update; setting from scratch creates one against the group. The two-branch
 * shape (create when absent, update when present) is what the workflow layer's
 * upsert wraps.
 */
export async function setRecruitmentCriteria(
  client: AscClient,
  groupId: string,
  filters: readonly DeviceFamilyOsVersionFilter[],
  existingCriterionId?: string,
): Promise<BetaRecruitmentCriterionResponse> {
  if (existingCriterionId !== undefined) {
    const { data } = await client.PATCH("/v1/betaRecruitmentCriteria/{id}", {
      params: { path: { id: existingCriterionId } },
      body: {
        data: {
          type: "betaRecruitmentCriteria",
          id: existingCriterionId,
          attributes: { deviceFamilyOsVersionFilters: [...filters] },
        },
      },
    });
    return expectDocument(data);
  }
  const { data } = await client.POST("/v1/betaRecruitmentCriteria", {
    body: {
      data: {
        type: "betaRecruitmentCriteria",
        attributes: { deviceFamilyOsVersionFilters: [...filters] },
        relationships: {
          betaGroup: { data: { type: "betaGroups", id: groupId } },
        },
      },
    },
  });
  return expectDocument(data);
}

/** Clears a group's recruitment criteria by deleting the criterion resource. */
export async function clearRecruitmentCriteria(
  client: AscClient,
  criterionId: string,
): Promise<void> {
  await client.DELETE("/v1/betaRecruitmentCriteria/{id}", {
    params: { path: { id: criterionId } },
  });
}

export interface ListRecruitmentCriterionOptionsOptions {
  readonly scope: ReadScope;
  readonly pageLimit?: number;
  readonly pagination?: PaginateOptions;
}

/**
 * Reads the legal device-family / OS-version matrix for recruitment criteria —
 * a read-only reference so callers write valid filters, never a strategy
 * recommendation derived from it.
 */
export function listRecruitmentCriterionOptions(
  client: AscClient,
  options: ListRecruitmentCriterionOptionsOptions,
): Promise<CollectedRead<BetaRecruitmentCriterionOption>> {
  const query = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
  };
  return readPaged(
    client,
    "/v1/betaRecruitmentCriterionOptions",
    { params: { query } },
    options.scope,
    options.pagination,
  );
}

/**
 * Preflight: does the group's recruitment criteria currently have at least one
 * compatible build? Returns Apple's computed `hasCompatibleBuild` so a caller
 * can warn before enabling public recruitment that would have nothing to test.
 */
export async function checkRecruitmentCompatibleBuild(
  client: AscClient,
  groupId: string,
): Promise<BetaRecruitmentCriterionCompatibleBuildCheckResponse> {
  const { data } = await client.GET(
    "/v1/betaGroups/{id}/betaRecruitmentCriterionCompatibleBuildCheck",
    { params: { path: { id: groupId } } },
  );
  return expectDocument(data);
}
