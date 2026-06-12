import type { MaybeOptionalInit } from "openapi-fetch";

import {
  AscError,
  AscRateLimitFloorError,
  AscUpstreamError,
} from "../errors.js";
import type { AscPaginationProgress } from "../errors.js";
import type { paths } from "../generated/asc-openapi.js";
import type { AscClient } from "../http/client.js";
import { parseRateLimitHeader } from "../http/rate-limit.js";
import type { RateLimitSnapshot } from "../http/rate-limit.js";
import { nextPageQuery } from "./next-link.js";
import type {
  AscPagedDocument,
  PagedGetPath,
  PageItemOf,
  PageOf,
} from "./paged-types.js";

/**
 * Default stop threshold for multi-page reads, in remaining hourly requests.
 * ~3% of ASC's default 3500/hour quota: a runaway full read always leaves
 * headroom for interactive work and the retry/replay machinery.
 */
export const DEFAULT_RATE_LIMIT_FLOOR = 100;

export interface PaginateOptions {
  /**
   * Stop (with AscRateLimitFloorError) before fetching a further page once
   * the latest X-Rate-Limit remaining drops below this many requests; 0
   * disables the guard. Already-fetched pages are always delivered first.
   */
  readonly rateLimitFloor?: number;
}

/** One page of a multi-page read. */
export interface AscPageResult<Page extends AscPagedDocument> {
  /** The contract-typed page document, verbatim. */
  readonly document: Page;
  /** Parsed from this page response's X-Rate-Limit header, when present. */
  readonly rateLimit?: RateLimitSnapshot;
}

/** What a caller declares about read cost; never a hidden default. */
export type ReadScope =
  | "single-page"
  | "all-pages"
  | { readonly maxItems: number };

/** A collected multi-page read: verbatim items plus pagination diagnostics. */
export interface CollectedRead<Item> {
  /** Contract-typed resources, verbatim, concatenated across pages. */
  readonly items: readonly Item[];
  readonly pagesRead: number;
  /** `meta.paging.total` from the last page reporting it (an ASC estimate). */
  readonly total?: number;
  /** True when the scope cut the read short while ASC had more data. */
  readonly truncated: boolean;
  /** Snapshot from the latest page response carrying one, for caller pacing. */
  readonly rateLimit?: RateLimitSnapshot;
}

/**
 * Internal view of `client.GET`: TypeScript cannot type a call whose Path is
 * itself generic (a known openapi-fetch wrapper limitation), so the call goes
 * through this loosened shape and a runtime envelope guard compensates. The
 * public surface stays fully typed.
 */
type LooseGet = (
  path: string,
  init: Record<string, unknown>,
) => Promise<{ data?: unknown; response: Response }>;

/**
 * Doubles as drift detection: only the pagination envelope is checked, never
 * the business items, keeping the module blind to resource schemas.
 */
function assertPagedDocument(payload: unknown, url: string): AscPagedDocument {
  const candidate = payload as
    | { data?: unknown; links?: unknown }
    | null
    | undefined;
  if (
    typeof candidate === "object" &&
    candidate !== null &&
    Array.isArray(candidate.data) &&
    typeof candidate.links === "object" &&
    candidate.links !== null
  ) {
    return payload as AscPagedDocument;
  }
  throw new AscUpstreamError(
    `Expected a paged collection document from ${url}, but the response does not match the contract envelope.`,
  );
}

/**
 * The pagination facet is readonly for every consumer; this is its one
 * writer. Augmenting the original instance (instead of wrapping it) keeps
 * the category/instanceof contract of the request layer fully intact.
 */
function rethrowWithProgress(
  error: unknown,
  progress: AscPaginationProgress,
): never {
  if (error instanceof AscError && error.pagination === undefined) {
    (error as { pagination?: AscPaginationProgress }).pagination = progress;
  }
  throw error;
}

/**
 * Lazily yields contract-typed pages, following `links.next` verbatim.
 * Cursor handling is fully internal; consumers stop a read by simply not
 * pulling the next page, so early termination never spends a request.
 */
export async function* paginate<Path extends PagedGetPath>(
  client: AscClient,
  path: Path,
  init: MaybeOptionalInit<paths[Path], "get">,
  options: PaginateOptions = {},
): AsyncGenerator<AscPageResult<PageOf<Path>>, void, undefined> {
  const floor = options.rateLimitFloor ?? DEFAULT_RATE_LIMIT_FLOOR;
  const get = client.GET as unknown as LooseGet;
  const progress = { pagesRead: 0, itemsRead: 0 };
  let queryOverride: string | undefined;

  for (;;) {
    let document: AscPagedDocument;
    let response: Response;
    try {
      const currentQuery = queryOverride;
      const result = await get(path, {
        ...(init as object),
        ...(currentQuery !== undefined && {
          querySerializer: () => currentQuery,
        }),
      });
      response = result.response;
      document = assertPagedDocument(result.data, response.url);
    } catch (error) {
      rethrowWithProgress(error, { ...progress });
    }

    const rateLimit = parseRateLimitHeader(
      response.headers.get("x-rate-limit"),
    );
    yield {
      document: document as PageOf<Path>,
      ...(rateLimit !== undefined && { rateLimit }),
    };
    progress.pagesRead += 1;
    progress.itemsRead += document.data.length;

    const next = document.links.next;
    if (next === undefined) {
      return;
    }

    if (
      floor > 0 &&
      rateLimit?.remaining !== undefined &&
      rateLimit.remaining < floor
    ) {
      throw new AscRateLimitFloorError(
        `Stopped a multi-page read after ${String(progress.pagesRead)} page(s) / ` +
          `${String(progress.itemsRead)} item(s): ${String(rateLimit.remaining)} requests ` +
          `remain this hour, below the configured floor of ${String(floor)}. ` +
          `Retry once the quota window rolls over, or pass rateLimitFloor: 0 to disable the guard.`,
        floor,
        { rateLimit, pagination: { ...progress } },
      );
    }

    let nextQuery: string;
    try {
      nextQuery = nextPageQuery(next);
    } catch (error) {
      rethrowWithProgress(error, { ...progress });
    }
    if (nextQuery === queryOverride) {
      rethrowWithProgress(
        new AscUpstreamError(
          "ASC returned a links.next identical to the page just fetched; refusing to loop.",
        ),
        { ...progress },
      );
    }
    queryOverride = nextQuery;
  }
}

/**
 * Collects a paged read under an explicit scope. This is the consumption
 * form for the capability layer; streaming consumers (workflows) use
 * `paginate` directly.
 */
export async function readPaged<Path extends PagedGetPath>(
  client: AscClient,
  path: Path,
  init: MaybeOptionalInit<paths[Path], "get">,
  scope: ReadScope,
  options?: PaginateOptions,
): Promise<CollectedRead<PageItemOf<Path>>> {
  const maxItems = typeof scope === "object" ? scope.maxItems : undefined;
  if (maxItems !== undefined && (!Number.isInteger(maxItems) || maxItems < 1)) {
    throw new RangeError(
      `maxItems must be a positive integer; got ${String(maxItems)}.`,
    );
  }

  const items: unknown[] = [];
  let pagesRead = 0;
  let total: number | undefined;
  let rateLimit: RateLimitSnapshot | undefined;
  let truncated = false;

  for await (const page of paginate(client, path, init, options)) {
    pagesRead += 1;
    if (page.rateLimit !== undefined) {
      rateLimit = page.rateLimit;
    }
    const document: AscPagedDocument = page.document;
    total = document.meta?.paging?.total ?? total;
    const hasNext = document.links.next !== undefined;

    if (maxItems !== undefined) {
      const room = maxItems - items.length;
      if (document.data.length > room) {
        items.push(...document.data.slice(0, room));
        truncated = true;
        break;
      }
      items.push(...document.data);
      if (items.length === maxItems) {
        truncated = hasNext;
        break;
      }
    } else {
      items.push(...document.data);
    }

    if (scope === "single-page") {
      truncated = hasNext;
      break;
    }
  }

  return {
    items,
    pagesRead,
    truncated,
    ...(total !== undefined && { total }),
    ...(rateLimit !== undefined && { rateLimit }),
  };
}
