import type { components } from "../generated/asc-openapi.js";
import { AscNotFoundError } from "../errors.js";
import type { AscClient } from "../http/client.js";
import { expectDocument } from "./internal.js";

export type AgeRatingDeclaration =
  components["schemas"]["AgeRatingDeclaration"];

/**
 * Reads an app's age-rating declaration (read-only, decision D1). The
 * declaration is app-info scoped, NOT version scoped: it does not appear in any
 * appStoreVersions field/include list. It is resolved by listing the app's
 * appInfos with `include=ageRatingDeclaration` and pulling the declaration out
 * of `included` — the declaration has no app-id collection of its own. An app
 * has multiple appInfos (live + editable draft) but they share a single
 * declaration, so the first included declaration is authoritative. Throws
 * AscNotFoundError when no declaration is present (an app-info without one).
 *
 * This phase is read-only by deliberate scope (decision D); the contract's
 * ageRatingDeclarations PATCH exists and is Apple-supported, so writing is a
 * deferred-not-implemented capability (exit 5), NOT Apple-unsupported (exit 6).
 */
export async function getAgeRatingDeclaration(
  client: AscClient,
  appId: string,
): Promise<AgeRatingDeclaration> {
  const { data } = await client.GET("/v1/apps/{id}/appInfos", {
    params: {
      path: { id: appId },
      query: { include: ["ageRatingDeclaration"] },
    },
  });
  const document = expectDocument(data);
  const declaration = document.included?.find(
    (resource): resource is AgeRatingDeclaration =>
      resource.type === "ageRatingDeclarations",
  );
  if (declaration === undefined) {
    throw new AscNotFoundError(
      `App ${appId} has no age-rating declaration yet.`,
    );
  }
  return declaration;
}
