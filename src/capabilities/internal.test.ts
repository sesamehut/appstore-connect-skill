import { describe, expect, it } from "vitest";

import { AscUpstreamError } from "../errors.js";
import { expectDocument } from "./internal.js";

describe("expectDocument", () => {
  it("returns the document when defined", () => {
    const document = { data: { id: "1" } };
    expect(expectDocument(document)).toBe(document);
  });

  it("throws an upstream error on undefined", () => {
    expect(() => {
      expectDocument(undefined);
    }).toThrow(AscUpstreamError);
  });
});
