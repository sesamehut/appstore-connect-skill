import { describe, expect, it } from "vitest";

import { AscUpstreamError } from "../errors.js";
import { nextPageQuery } from "./next-link.js";

describe("nextPageQuery", () => {
  it("returns the query string verbatim, encoding untouched", () => {
    const query = "?cursor=eyJv%3D%3D&limit=1&fields%5Bapps%5D=bundleId,name";
    const result = nextPageQuery(
      `https://api.appstoreconnect.apple.com/v1/apps${query}`,
    );

    expect(result).toBe(query);
  });

  it("keeps plus signs and padding characters as Apple sent them", () => {
    const result = nextPageQuery("https://example.test/v1/apps?cursor=a+b=");

    expect(result).toBe("?cursor=a+b=");
  });

  it("rejects a next link without a query string", () => {
    expect(() =>
      nextPageQuery("https://api.appstoreconnect.apple.com/v1/apps"),
    ).toThrow(AscUpstreamError);
  });

  it("rejects an unparseable next link and keeps the cause", () => {
    let thrown: unknown;
    try {
      nextPageQuery("not a url");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AscUpstreamError);
    expect((thrown as AscUpstreamError).cause).toBeInstanceOf(TypeError);
  });
});
