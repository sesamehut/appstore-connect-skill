import { AscUpstreamError } from "../errors.js";

/**
 * Extracts the raw query string (`?cursor=...&limit=...`) from a `links.next`
 * URL. The cursor is never parsed or reconstructed: the whole query is
 * substituted verbatim into the follow-up request through a per-request
 * querySerializer override (openapi-fetch strips the leading `?` itself), and
 * the client's configured baseUrl keeps applying to follow-up pages.
 */
export function nextPageQuery(nextLink: string): string {
  let url: URL;
  try {
    url = new URL(nextLink);
  } catch (cause) {
    throw new AscUpstreamError("ASC returned an unparseable links.next URL.", {
      cause,
    });
  }
  // A next link without a query cannot carry a cursor; following it would
  // refetch the first page forever.
  if (url.search === "") {
    throw new AscUpstreamError(
      "ASC returned a links.next URL without a query string; refusing to follow it.",
    );
  }
  return url.search;
}
