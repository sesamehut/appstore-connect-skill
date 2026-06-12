import { describe, expectTypeOf, it } from "vitest";

import type { components, paths } from "../src/generated/asc-openapi.js";
import type {
  PagedGetPath,
  PageItemOf,
  PageOf,
} from "../src/pagination/paged-types.js";

// Review guard for the generated contract: regeneration is never reviewed
// line-by-line, so a silently-empty artifact, a generator switch away from
// literal-union enums, or a dropped JSON:API query surface must surface here
// as type errors (checked by `npm run typecheck`; the runtime pass is a no-op).

type AppsGetCollection = paths["/v1/apps"]["get"];
type AppsQuery = NonNullable<AppsGetCollection["parameters"]["query"]>;
type AscError = NonNullable<
  components["schemas"]["ErrorResponse"]["errors"]
>[number];

describe("generated ASC contract", () => {
  it("exposes the apps collection operation with its response envelope", () => {
    expectTypeOf<
      AppsGetCollection["responses"][200]["content"]["application/json"]
    >().toEqualTypeOf<components["schemas"]["AppsResponse"]>();
    expectTypeOf<components["schemas"]["AppsResponse"]["data"]>().toEqualTypeOf<
      components["schemas"]["App"][]
    >();
  });

  it("carries the JSON:API query surface on collection reads", () => {
    expectTypeOf<AppsQuery>().toHaveProperty("limit");
    expectTypeOf<AppsQuery>().toHaveProperty("fields[apps]");
    expectTypeOf<AppsQuery>().toHaveProperty("filter[bundleId]");
    expectTypeOf<AppsQuery["limit"]>().toEqualTypeOf<number | undefined>();
  });

  it("inlines resource type enums as string literals", () => {
    expectTypeOf<
      components["schemas"]["App"]["type"]
    >().toEqualTypeOf<"apps">();
  });

  it("models the JSON:API error envelope", () => {
    expectTypeOf<AscError["code"]>().toEqualTypeOf<string>();
    expectTypeOf<AscError["status"]>().toEqualTypeOf<string>();
    expectTypeOf<AscError["title"]>().toEqualTypeOf<string>();
    expectTypeOf<AscError["detail"]>().toEqualTypeOf<string>();
  });

  it("keeps cursor pagination links on collection responses", () => {
    expectTypeOf<
      components["schemas"]["AppsResponse"]["links"]
    >().toEqualTypeOf<components["schemas"]["PagedDocumentLinks"]>();
  });
});

// The pagination layer's structural endpoint filter must keep admitting
// collection endpoints and rejecting detail endpoints across contract
// regenerations; a drift here is an M3 design assumption being broken.
type Extends<A, B> = [A] extends [B] ? true : false;

describe("pagination endpoint filter", () => {
  it("admits cursor-paged collection endpoints", () => {
    expectTypeOf<Extends<"/v1/apps", PagedGetPath>>().toEqualTypeOf<true>();
    expectTypeOf<
      Extends<"/v1/apps/{id}/appStoreVersions", PagedGetPath>
    >().toEqualTypeOf<true>();
  });

  it("rejects single-resource detail endpoints", () => {
    expectTypeOf<
      Extends<"/v1/apps/{id}", PagedGetPath>
    >().toEqualTypeOf<false>();
  });

  it("resolves page and item types to the contract schemas", () => {
    expectTypeOf<PageOf<"/v1/apps">>().toEqualTypeOf<
      components["schemas"]["AppsResponse"]
    >();
    expectTypeOf<PageItemOf<"/v1/apps">>().toEqualTypeOf<
      components["schemas"]["App"]
    >();
    expectTypeOf<PageItemOf<"/v1/apps/{id}/appStoreVersions">>().toEqualTypeOf<
      components["schemas"]["AppStoreVersion"]
    >();
  });
});
