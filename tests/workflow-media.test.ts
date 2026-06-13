import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AscFileProcessingError, AscUpstreamError } from "../src/errors.js";
import { ASC_API_BASE_URL } from "../src/http/client.js";
import type { AscClient } from "../src/http/client.js";
import {
  ensureScreenshotSet,
  getScreenshotStatus,
  resolveLocalization,
  uploadPreview,
  uploadScreenshot,
  uploadScreenshotSet,
} from "../src/workflows/media-assets.js";
import {
  JSON_HEADERS,
  makeOfflineClient,
  thrownBy,
} from "./helpers/asc-fixtures.js";
import { headerValue, useMockAgent } from "./helpers/mock-agent.js";

const getAgent = useMockAgent();
const UPLOAD_ORIGIN = "https://upload.example.test";

// Polling with no real delay: the injected sleep makes the loop instant.
const INSTANT = {
  sleep: async (): Promise<void> => {
    await Promise.resolve();
  },
};

let client: AscClient;
let dir: string;

beforeEach(async () => {
  client = await makeOfflineClient();
  dir = await mkdtemp(join(tmpdir(), "asc-media-wf-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function fixtureFile(name: string, contents: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, Buffer.from(contents));
  return path;
}

// --- fixtures ---------------------------------------------------------------

function uploadOp(path: string, offset: number, length: number) {
  return {
    url: `${UPLOAD_ORIGIN}${path}?sig=secret-${String(offset)}`,
    method: "PUT",
    offset,
    length,
    requestHeaders: [{ name: "Content-Type", value: "image/png" }],
  };
}

interface ScreenshotOpts {
  readonly state: string;
  readonly errors?: readonly { code: string; description: string }[];
  readonly ops?: readonly unknown[];
  readonly fileSize?: number;
}

function screenshot(id: string, opts: ScreenshotOpts) {
  return {
    type: "appScreenshots" as const,
    id,
    attributes: {
      fileName: "shot.png",
      fileSize: opts.fileSize ?? 11,
      assetDeliveryState: {
        state: opts.state,
        ...(opts.errors !== undefined && { errors: opts.errors }),
      },
      ...(opts.ops !== undefined && { uploadOperations: opts.ops }),
    },
  };
}

interface PreviewOpts {
  readonly assetState: string;
  readonly videoState?: string;
  readonly videoErrors?: readonly { code: string; description: string }[];
  readonly ops?: readonly unknown[];
}

function preview(id: string, opts: PreviewOpts) {
  return {
    type: "appPreviews" as const,
    id,
    attributes: {
      fileName: "preview.mov",
      fileSize: 11,
      assetDeliveryState: { state: opts.assetState },
      ...(opts.videoState !== undefined && {
        videoDeliveryState: {
          state: opts.videoState,
          ...(opts.videoErrors !== undefined && { errors: opts.videoErrors }),
        },
      }),
      ...(opts.ops !== undefined && { uploadOperations: opts.ops }),
    },
  };
}

function screenshotSet(id: string, displayType: string) {
  return {
    type: "appScreenshotSets" as const,
    id,
    attributes: { screenshotDisplayType: displayType },
  };
}

// --- interceptor helpers ----------------------------------------------------

/** Registers one ASC interceptor (FIFO-consumed); returns the captured body. */
function asc(
  method: string,
  path: string | ((p: string) => boolean),
  body: object | string,
  status = 200,
): () => string | undefined {
  let captured: string | undefined;
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({ path, method })
    .reply((request) => {
      captured = request.body as string | undefined;
      return {
        statusCode: status,
        data: body,
        responseOptions: { headers: JSON_HEADERS },
      };
    });
  return () => captured;
}

function ascList(
  path: string | ((p: string) => boolean),
  items: readonly unknown[],
): void {
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({ path, method: "GET" })
    .reply(
      200,
      { data: items, links: { self: `${ASC_API_BASE_URL}/v1/list` } },
      { headers: JSON_HEADERS },
    );
}

/** Intercepts a ranged PUT to the external upload host, capturing key headers. */
function put(path: string): {
  auth: () => string | undefined;
  contentLength: () => string | undefined;
} {
  // Sentinel distinguishes "header was absent" from "interceptor never ran".
  let auth: string | undefined = "UNSET";
  let contentLength: string | undefined;
  getAgent()
    .get(UPLOAD_ORIGIN)
    .intercept({ path: (p) => p.startsWith(path), method: "PUT" })
    .reply((request) => {
      auth = headerValue(request.headers, "authorization");
      contentLength = headerValue(request.headers, "content-length");
      return { statusCode: 200, data: "" };
    });
  return { auth: () => auth, contentLength: () => contentLength };
}

// --- resolveLocalization ----------------------------------------------------

describe("resolveLocalization", () => {
  function localization(id: string, locale: string) {
    return {
      type: "appStoreVersionLocalizations" as const,
      id,
      attributes: { locale },
    };
  }

  it("resolves a (version, locale) pair to the localization id", async () => {
    ascList(
      (p) =>
        decodeURIComponent(p).includes("filter[locale]") &&
        p.includes("/appStoreVersionLocalizations"),
      [localization("loc-1", "en-US")],
    );

    const resolved = await resolveLocalization(client, "ver-1", "en-US");

    expect(resolved.localizationId).toBe("loc-1");
    expect(resolved.locale).toBe("en-US");
  });

  it("answers a missing locale with the locales that do exist", async () => {
    ascList((p) => decodeURIComponent(p).includes("filter[locale]"), []);
    ascList(
      (p) => !decodeURIComponent(p).includes("filter[locale]"),
      [localization("loc-1", "en-US"), localization("loc-2", "de-DE")],
    );

    const error = await thrownBy(resolveLocalization(client, "ver-1", "fr-FR"));

    expect(error.message).toContain("en-US");
    expect(error.message).toContain("de-DE");
  });
});

// --- ensureScreenshotSet (find-or-create) -----------------------------------

describe("ensureScreenshotSet", () => {
  it("reuses an existing set of the display type and never POSTs", async () => {
    ascList(
      (p) =>
        p.startsWith(
          "/v1/appStoreVersionLocalizations/loc-1/appScreenshotSets",
        ),
      [screenshotSet("set-existing", "APP_IPHONE_67")],
    );

    const result = await ensureScreenshotSet(client, "loc-1", "APP_IPHONE_67");

    // No POST interceptor: assertNoPendingInterceptors is the "never created" check.
    expect(result.created).toBe(false);
    expect(result.set.id).toBe("set-existing");
  });

  it("creates a set when none matches the display type", async () => {
    ascList(
      (p) =>
        p.startsWith(
          "/v1/appStoreVersionLocalizations/loc-1/appScreenshotSets",
        ),
      [screenshotSet("set-other", "APP_IPHONE_61")],
    );
    const bodyOf = asc(
      "POST",
      "/v1/appScreenshotSets",
      { data: screenshotSet("set-new", "APP_IPHONE_67") },
      201,
    );

    const result = await ensureScreenshotSet(client, "loc-1", "APP_IPHONE_67");

    expect(result.created).toBe(true);
    expect(result.set.id).toBe("set-new");
    expect(JSON.parse(bodyOf() ?? "{}")).toMatchObject({
      data: {
        type: "appScreenshotSets",
        attributes: { screenshotDisplayType: "APP_IPHONE_67" },
        relationships: {
          appStoreVersionLocalization: {
            data: { type: "appStoreVersionLocalizations", id: "loc-1" },
          },
        },
      },
    });
  });
});

// --- uploadScreenshot (reserve → transfer → commit → confirm) ----------------

describe("uploadScreenshot", () => {
  it("reserves, PUTs without auth, commits the whole-file MD5, confirms COMPLETE", async () => {
    const path = await fixtureFile("shot.png", "HELLO-WORLD");
    const expectedMd5 = createHash("md5").update("HELLO-WORLD").digest("hex");

    asc(
      "POST",
      "/v1/appScreenshots",
      {
        data: screenshot("shot-1", {
          state: "AWAITING_UPLOAD",
          ops: [uploadOp("/up/0", 0, 11)],
        }),
      },
      201,
    );
    const transfer = put("/up/0");
    const commitBody = asc("PATCH", "/v1/appScreenshots/shot-1", {
      data: screenshot("shot-1", { state: "UPLOAD_COMPLETE" }),
    });
    // Two polls: UPLOAD_COMPLETE (still pending) then COMPLETE.
    asc("GET", "/v1/appScreenshots/shot-1", {
      data: screenshot("shot-1", { state: "UPLOAD_COMPLETE" }),
    });
    asc("GET", "/v1/appScreenshots/shot-1", {
      data: screenshot("shot-1", { state: "COMPLETE" }),
    });

    const result = await uploadScreenshot(client, "set-1", path, INSTANT);

    // The critical security assertion: no Bearer token reaches the upload host.
    expect(transfer.auth()).toBeUndefined();
    expect(transfer.contentLength()).toBe("11");
    expect(result.complete).toBe(true);
    expect(result.finalState).toBe("COMPLETE");
    expect(result.operationCount).toBe(1);
    expect(result.bytesTransferred).toBe(11);
    expect(result.md5).toBe(expectedMd5);
    expect(JSON.parse(commitBody() ?? "{}")).toMatchObject({
      data: {
        type: "appScreenshots",
        id: "shot-1",
        attributes: { uploaded: true, sourceFileChecksum: expectedMd5 },
      },
    });
  });

  it("transfers every operation's range across a multi-op reservation", async () => {
    const path = await fixtureFile("multi.png", "ABCDEFGHIJ");
    asc(
      "POST",
      "/v1/appScreenshots",
      {
        data: screenshot("shot-2", {
          state: "AWAITING_UPLOAD",
          fileSize: 10,
          ops: [uploadOp("/up/0", 0, 4), uploadOp("/up/1", 4, 6)],
        }),
      },
      201,
    );
    const first = put("/up/0");
    const second = put("/up/1");
    asc("PATCH", "/v1/appScreenshots/shot-2", {
      data: screenshot("shot-2", { state: "UPLOAD_COMPLETE", fileSize: 10 }),
    });
    asc("GET", "/v1/appScreenshots/shot-2", {
      data: screenshot("shot-2", { state: "COMPLETE", fileSize: 10 }),
    });

    const result = await uploadScreenshot(client, "set-1", path, INSTANT);

    expect(result.operationCount).toBe(2);
    expect(result.bytesTransferred).toBe(10);
    // Each PUT declared exactly its slice length (byte-exactness is unit-tested).
    expect(first.contentLength()).toBe("4");
    expect(second.contentLength()).toBe("6");
  });

  it("rejects a reservation with no upload operations as an upstream error", async () => {
    const path = await fixtureFile("shot.png", "HELLO-WORLD");
    asc(
      "POST",
      "/v1/appScreenshots",
      { data: screenshot("shot-3", { state: "AWAITING_UPLOAD" }) },
      201,
    );

    const error = await thrownBy(
      uploadScreenshot(client, "set-1", path, INSTANT),
    );
    expect(error).toBeInstanceOf(AscUpstreamError);
  });

  it("maps a terminal FAILED state to a processing-stage error with Apple's reason", async () => {
    const path = await fixtureFile("shot.png", "HELLO-WORLD");
    asc(
      "POST",
      "/v1/appScreenshots",
      {
        data: screenshot("shot-4", {
          state: "AWAITING_UPLOAD",
          ops: [uploadOp("/up/0", 0, 11)],
        }),
      },
      201,
    );
    put("/up/0");
    asc("PATCH", "/v1/appScreenshots/shot-4", {
      data: screenshot("shot-4", { state: "UPLOAD_COMPLETE" }),
    });
    asc("GET", "/v1/appScreenshots/shot-4", {
      data: screenshot("shot-4", {
        state: "FAILED",
        errors: [{ code: "DIMENSIONS", description: "wrong size" }],
      }),
    });

    const error = await thrownBy(
      uploadScreenshot(client, "set-1", path, INSTANT),
    );

    expect(error).toBeInstanceOf(AscFileProcessingError);
    expect(error).toMatchObject({ stage: "processing", target: "shot-4" });
    expect(error.message).toContain("wrong size");
  });

  it("returns pollTimedOut without throwing when processing outlasts the budget", async () => {
    const path = await fixtureFile("shot.png", "HELLO-WORLD");
    asc(
      "POST",
      "/v1/appScreenshots",
      {
        data: screenshot("shot-5", {
          state: "AWAITING_UPLOAD",
          ops: [uploadOp("/up/0", 0, 11)],
        }),
      },
      201,
    );
    put("/up/0");
    asc("PATCH", "/v1/appScreenshots/shot-5", {
      data: screenshot("shot-5", { state: "UPLOAD_COMPLETE" }),
    });
    // maxAttempts = ceil(10/10) = 1: exactly one poll, still pending.
    asc("GET", "/v1/appScreenshots/shot-5", {
      data: screenshot("shot-5", { state: "UPLOAD_COMPLETE" }),
    });

    const result = await uploadScreenshot(client, "set-1", path, {
      ...INSTANT,
      pollIntervalMs: 10,
      pollTimeoutMs: 10,
    });

    expect(result.pollTimedOut).toBe(true);
    expect(result.complete).toBe(false);
  });
});

// --- uploadPreview (dual state: bytes + video transcode) --------------------

describe("uploadPreview", () => {
  it("infers the mimeType and waits for both asset and video to complete", async () => {
    const path = await fixtureFile("preview.mov", "MOVIE-BYTES");
    const reserveBody = asc(
      "POST",
      "/v1/appPreviews",
      {
        data: preview("prev-1", {
          assetState: "AWAITING_UPLOAD",
          ops: [uploadOp("/up/0", 0, 11)],
        }),
      },
      201,
    );
    const transfer = put("/up/0");
    asc("PATCH", "/v1/appPreviews/prev-1", {
      data: preview("prev-1", {
        assetState: "UPLOAD_COMPLETE",
        videoState: "PROCESSING",
      }),
    });
    // Asset done but video still PROCESSING: must keep polling, not finish.
    asc("GET", "/v1/appPreviews/prev-1", {
      data: preview("prev-1", {
        assetState: "COMPLETE",
        videoState: "PROCESSING",
      }),
    });
    asc("GET", "/v1/appPreviews/prev-1", {
      data: preview("prev-1", {
        assetState: "COMPLETE",
        videoState: "COMPLETE",
      }),
    });

    const result = await uploadPreview(client, "set-1", path, INSTANT);

    expect(transfer.auth()).toBeUndefined();
    expect(result.complete).toBe(true);
    // .mov → video/quicktime, inferred without an explicit --mime-type.
    expect(JSON.parse(reserveBody() ?? "{}")).toMatchObject({
      data: { attributes: { mimeType: "video/quicktime" } },
    });
  });

  it("maps a FAILED video transcode to a processing-stage error", async () => {
    const path = await fixtureFile("preview.mov", "MOVIE-BYTES");
    asc(
      "POST",
      "/v1/appPreviews",
      {
        data: preview("prev-2", {
          assetState: "AWAITING_UPLOAD",
          ops: [uploadOp("/up/0", 0, 11)],
        }),
      },
      201,
    );
    put("/up/0");
    asc("PATCH", "/v1/appPreviews/prev-2", {
      data: preview("prev-2", {
        assetState: "UPLOAD_COMPLETE",
        videoState: "PROCESSING",
      }),
    });
    asc("GET", "/v1/appPreviews/prev-2", {
      data: preview("prev-2", {
        assetState: "COMPLETE",
        videoState: "FAILED",
        videoErrors: [{ code: "CODEC", description: "bad codec" }],
      }),
    });

    const error = await thrownBy(uploadPreview(client, "set-1", path, INSTANT));

    expect(error).toBeInstanceOf(AscFileProcessingError);
    expect(error).toMatchObject({ stage: "processing" });
    expect(error.message).toContain("bad codec");
  });
});

// --- uploadScreenshotSet (whole-set batch + reorder) ------------------------

describe("uploadScreenshotSet", () => {
  it("uploads each file then reorders the set to lead with the batch", async () => {
    const a = await fixtureFile("a.png", "AAAA");
    const b = await fixtureFile("b.png", "BBBB");

    ascList(
      (p) =>
        p.startsWith(
          "/v1/appStoreVersionLocalizations/loc-1/appScreenshotSets",
        ),
      [screenshotSet("set-1", "APP_IPHONE_67")],
    );
    asc(
      "POST",
      "/v1/appScreenshots",
      {
        data: screenshot("shot-a", {
          state: "AWAITING_UPLOAD",
          fileSize: 4,
          ops: [uploadOp("/up/a", 0, 4)],
        }),
      },
      201,
    );
    put("/up/a");
    asc("PATCH", "/v1/appScreenshots/shot-a", {
      data: screenshot("shot-a", { state: "UPLOAD_COMPLETE", fileSize: 4 }),
    });
    asc(
      "POST",
      "/v1/appScreenshots",
      {
        data: screenshot("shot-b", {
          state: "AWAITING_UPLOAD",
          fileSize: 4,
          ops: [uploadOp("/up/b", 0, 4)],
        }),
      },
      201,
    );
    put("/up/b");
    asc("PATCH", "/v1/appScreenshots/shot-b", {
      data: screenshot("shot-b", { state: "UPLOAD_COMPLETE", fileSize: 4 }),
    });
    // Reorder reads the full membership, then PATCHes the relationship.
    ascList(
      (p) => p.startsWith("/v1/appScreenshotSets/set-1/appScreenshots"),
      [
        screenshot("shot-a", { state: "COMPLETE" }),
        screenshot("shot-b", { state: "COMPLETE" }),
      ],
    );
    const reorderBody = asc(
      "PATCH",
      "/v1/appScreenshotSets/set-1/relationships/appScreenshots",
      "",
      204,
    );

    const result = await uploadScreenshotSet(
      client,
      "loc-1",
      "APP_IPHONE_67",
      [a, b],
      { wait: false, reorder: true },
    );

    expect(result.setCreated).toBe(false);
    expect(result.uploads).toHaveLength(2);
    expect(result.order).toEqual(["shot-a", "shot-b"]);
    expect(JSON.parse(reorderBody() ?? "{}")).toEqual({
      data: [
        { type: "appScreenshots", id: "shot-a" },
        { type: "appScreenshots", id: "shot-b" },
      ],
    });
  });
});

// --- getScreenshotStatus ----------------------------------------------------

describe("getScreenshotStatus", () => {
  it("reads the current state once without polling by default", async () => {
    asc("GET", "/v1/appScreenshots/shot-1", {
      data: screenshot("shot-1", { state: "COMPLETE" }),
    });

    const status = await getScreenshotStatus(client, "shot-1");

    expect(status.complete).toBe(true);
    expect(status.failed).toBe(false);
    expect(status.finalState).toBe("COMPLETE");
  });
});
