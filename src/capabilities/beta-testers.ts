import type { components, operations } from "../generated/asc-openapi.js";
import type { AscClient } from "../http/client.js";
import { expectDocument } from "./internal.js";
import { readPaged } from "../pagination/paginate.js";
import type {
  CollectedRead,
  PaginateOptions,
  ReadScope,
} from "../pagination/paginate.js";

export type BetaTester = components["schemas"]["BetaTester"];
export type BetaTesterResponse = components["schemas"]["BetaTesterResponse"];
export type BetaInviteType = components["schemas"]["BetaInviteType"];

/**
 * Create attributes (email + optional name). betaTesters have NO PATCH: name
 * and email are fixed at creation, so there is no update capability here.
 */
export type BetaTesterCreateAttributes =
  components["schemas"]["BetaTesterCreateRequest"]["data"]["attributes"];

type TestersQuery = NonNullable<
  operations["betaTesters_getCollection"]["parameters"]["query"]
>;
type TesterInstanceQuery = NonNullable<
  operations["betaTesters_getInstance"]["parameters"]["query"]
>;

export interface ListBetaTestersOptions {
  /** Read-cost declaration; always an explicit call-site decision. */
  readonly scope: ReadScope;
  readonly pageLimit?: TestersQuery["limit"];
  /** Restrict to testers of these app id(s). */
  readonly apps?: TestersQuery["filter[apps]"];
  /** Restrict to members of these group id(s). */
  readonly betaGroups?: TestersQuery["filter[betaGroups]"];
  /** Restrict to testers of these build id(s). */
  readonly builds?: TestersQuery["filter[builds]"];
  /** Exact email match; the lookup key for "is this person already a tester". */
  readonly email?: TestersQuery["filter[email]"];
  readonly inviteType?: TestersQuery["filter[inviteType]"];
  readonly sort?: TestersQuery["sort"];
  readonly fields?: TestersQuery["fields[betaTesters]"];
  readonly pagination?: PaginateOptions;
}

/** Reads beta testers, filterable by app, group, build, email, or invite type. */
export function listBetaTesters(
  client: AscClient,
  options: ListBetaTestersOptions,
): Promise<CollectedRead<BetaTester>> {
  const query: TestersQuery = {
    ...(options.pageLimit !== undefined && { limit: options.pageLimit }),
    ...(options.apps !== undefined && { "filter[apps]": options.apps }),
    ...(options.betaGroups !== undefined && {
      "filter[betaGroups]": options.betaGroups,
    }),
    ...(options.builds !== undefined && { "filter[builds]": options.builds }),
    ...(options.email !== undefined && { "filter[email]": options.email }),
    ...(options.inviteType !== undefined && {
      "filter[inviteType]": options.inviteType,
    }),
    ...(options.sort !== undefined && { sort: options.sort }),
    ...(options.fields !== undefined && {
      "fields[betaTesters]": options.fields,
    }),
  };
  return readPaged(
    client,
    "/v1/betaTesters",
    { params: { query } },
    options.scope,
    options.pagination,
  );
}

export interface GetBetaTesterOptions {
  readonly fields?: TesterInstanceQuery["fields[betaTesters]"];
  readonly include?: TesterInstanceQuery["include"];
}

/** Reads one beta tester by ASC id, with optional related includes. */
export async function getBetaTester(
  client: AscClient,
  testerId: string,
  options: GetBetaTesterOptions = {},
): Promise<BetaTesterResponse> {
  const query: TesterInstanceQuery = {
    ...(options.fields !== undefined && {
      "fields[betaTesters]": options.fields,
    }),
    ...(options.include !== undefined && { include: options.include }),
  };
  const { data } = await client.GET("/v1/betaTesters/{id}", {
    params: { path: { id: testerId }, query },
  });
  return expectDocument(data);
}

/**
 * Creates a beta tester, optionally linking it to groups and/or builds in the
 * same request. Linking to a group with a distributable build emails a real
 * TestFlight invitation — whether a bare create (no group) also emails is not
 * yet confirmed (live-verify #1), so callers treat any create as potentially
 * notifying.
 */
export async function createBetaTester(
  client: AscClient,
  attributes: BetaTesterCreateAttributes,
  options: {
    readonly betaGroupIds?: readonly string[];
    readonly buildIds?: readonly string[];
  } = {},
): Promise<BetaTesterResponse> {
  const relationships: NonNullable<
    components["schemas"]["BetaTesterCreateRequest"]["data"]["relationships"]
  > = {};
  if (options.betaGroupIds !== undefined) {
    relationships.betaGroups = {
      data: options.betaGroupIds.map((id) => ({
        type: "betaGroups" as const,
        id,
      })),
    };
  }
  if (options.buildIds !== undefined) {
    relationships.builds = {
      data: options.buildIds.map((id) => ({ type: "builds" as const, id })),
    };
  }
  const { data } = await client.POST("/v1/betaTesters", {
    body: {
      data: {
        type: "betaTesters",
        attributes,
        ...(Object.keys(relationships).length > 0 && { relationships }),
      },
    },
  });
  return expectDocument(data);
}

/**
 * Deletes a beta tester at the account level. Apple answers 202/204 and the
 * removal is asynchronous, so a subsequent read may still briefly see the
 * tester; the result is "accepted", not "asserted gone" (live-verify #4).
 */
export async function deleteBetaTester(
  client: AscClient,
  testerId: string,
): Promise<void> {
  await client.DELETE("/v1/betaTesters/{id}", {
    params: { path: { id: testerId } },
  });
}

/**
 * Removes a tester from specific apps (revokes their access to those apps'
 * TestFlight) via the tester-side apps relationship DELETE. Also asynchronous
 * (202): "accepted", not immediately consistent.
 */
export async function removeTesterFromApp(
  client: AscClient,
  testerId: string,
  appIds: readonly string[],
): Promise<void> {
  await client.DELETE("/v1/betaTesters/{id}/relationships/apps", {
    params: { path: { id: testerId } },
    body: { data: appIds.map((id) => ({ type: "apps" as const, id })) },
  });
}

/**
 * Tester-side group linkage. The build-side / group-side relationship edits are
 * canonical (see beta-groups.addTestersToGroup); these tester-side aliases exist
 * only for the rare case where a caller already holds the tester id and wants to
 * edit from that end. Kept internal — not part of the public surface.
 */
export async function addGroupsToTester(
  client: AscClient,
  testerId: string,
  groupIds: readonly string[],
): Promise<void> {
  await client.POST("/v1/betaTesters/{id}/relationships/betaGroups", {
    params: { path: { id: testerId } },
    body: { data: groupIds.map((id) => ({ type: "betaGroups" as const, id })) },
  });
}

/** Internal alias: remove a tester from groups from the tester side. */
export async function removeGroupsFromTester(
  client: AscClient,
  testerId: string,
  groupIds: readonly string[],
): Promise<void> {
  await client.DELETE("/v1/betaTesters/{id}/relationships/betaGroups", {
    params: { path: { id: testerId } },
    body: { data: groupIds.map((id) => ({ type: "betaGroups" as const, id })) },
  });
}
