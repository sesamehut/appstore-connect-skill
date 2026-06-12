import { describe, expectTypeOf, it } from "vitest";
import type { components, paths } from "../src/generated/asc-openapi.js";

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
