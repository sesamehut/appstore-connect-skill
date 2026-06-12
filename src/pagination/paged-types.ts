import type { ClientPathsWithMethod } from "openapi-fetch";

import type { paths } from "../generated/asc-openapi.js";
import type { AscClient } from "../http/client.js";

/**
 * Structural envelope shared by every ASC collection response. Pagination is
 * designed against this shape only; business schemas never enter the module.
 */
export interface AscPagedDocument {
  readonly data: readonly unknown[];
  readonly links: {
    readonly next?: string;
  };
  readonly meta?: {
    readonly paging?: {
      readonly total?: number;
    };
  };
}

type GetPath = ClientPathsWithMethod<AscClient, "get">;

/**
 * GET endpoints whose 200 JSON document is a cursor-paged collection.
 * Collection endpoints match structurally; detail endpoints (single-resource
 * `data`) and non-JSON downloads fall out without naming any business schema.
 */
export type PagedGetPath = {
  [P in GetPath]: paths[P] extends {
    get: {
      responses: {
        200: { content: { "application/json": AscPagedDocument } };
      };
    };
  }
    ? P
    : never;
}[GetPath];

/** The contract document one page of `Path` yields (e.g. AppsResponse). */
export type PageOf<Path extends PagedGetPath> = paths[Path] extends {
  get: {
    responses: {
      200: {
        content: { "application/json": infer Doc extends AscPagedDocument };
      };
    };
  };
}
  ? Doc
  : never;

/** Element type of a page's `data` array (e.g. App). */
export type PageItemOf<Path extends PagedGetPath> =
  PageOf<Path>["data"][number];
