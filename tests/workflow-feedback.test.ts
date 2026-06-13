import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AscFileProcessingError, AscNotFoundError } from "../src/errors.js";
import { ASC_API_BASE_URL } from "../src/http/client.js";
import type { AscClient } from "../src/http/client.js";
import {
  downloadCrashFeedbackLog,
  downloadFeedbackAttachments,
  downloadScreenshotFeedbackAttachments,
} from "../src/workflows/feedback-files.js";
import {
  ensureBetaGroup,
  findBetaAppReviewDetail,
  findLatestProcessedBuild,
  findRecruitmentCriterionId,
  upsertBetaAppLocalization,
  upsertBetaBuildLocalization,
} from "../src/workflows/beta-distribution.js";
import {
  JSON_HEADERS,
  makeOfflineClient,
  thrownBy,
} from "./helpers/asc-fixtures.js";
import { headerValue, useMockAgent } from "./helpers/mock-agent.js";

const getAgent = useMockAgent();
const CDN_ORIGIN = "https://feedback-cdn.example.test";

// Shrink the auth-free CDN fetch backoff so a failure path resolves instantly.
const ZERO_BACKOFF = { maxAttempts: 1, baseDelayMs: 0 } as const;

let client: AscClient;
let dir: string;

beforeEach(async () => {
  client = await makeOfflineClient();
  dir = await mkdtemp(join(tmpdir(), "asc-feedback-wf-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// --- ASC interceptor helpers -----------------------------------------------

function ascGet(prefix: string, data: object | string): void {
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({ path: (path) => path.startsWith(prefix), method: "GET" })
    .reply(200, data, { headers: JSON_HEADERS });
}

function ascWrite(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  status: number,
  data: object | string,
): () => string | undefined {
  let body: string | undefined;
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({ path, method })
    .reply((request) => {
      body = request.body as string | undefined;
      return {
        statusCode: status,
        data,
        responseOptions: { headers: JSON_HEADERS },
      };
    });
  return () => body;
}

function ascList(prefix: string, items: readonly unknown[]): void {
  ascGet(prefix, { data: items, links: { self: `${ASC_API_BASE_URL}/v1/x` } });
}

/** Intercepts a CDN image GET and captures the authorization header it saw. */
function cdnImage(
  pathPrefix: string,
  bytes: Buffer,
  status = 200,
): () => string | undefined {
  // Sentinel separates "header absent" from "interceptor never ran".
  let auth: string | undefined = "UNSET";
  getAgent()
    .get(CDN_ORIGIN)
    .intercept({ path: (p) => p.startsWith(pathPrefix), method: "GET" })
    .reply((request) => {
      auth = headerValue(request.headers, "authorization");
      return { statusCode: status, data: status === 200 ? bytes : "" };
    });
  return () => auth;
}

function screenshotSubmission(
  id: string,
  images: readonly Record<string, unknown>[],
) {
  return {
    data: {
      type: "betaFeedbackScreenshotSubmissions",
      id,
      attributes: { screenshots: images },
    },
    links: {
      self: `${ASC_API_BASE_URL}/v1/betaFeedbackScreenshotSubmissions/${id}`,
    },
  };
}

function crashLog(id: string, logText: string | undefined) {
  return {
    data: {
      type: "betaCrashLogs",
      id: `log-${id}`,
      attributes: logText === undefined ? {} : { logText },
    },
    links: {
      self: `${ASC_API_BASE_URL}/v1/betaFeedbackCrashSubmissions/${id}/crashLog`,
    },
  };
}

// --- downloadScreenshotFeedbackAttachments ---------------------------------

describe("downloadScreenshotFeedbackAttachments", () => {
  it("downloads each image WITHOUT auth, numbers filenames, and strips the signed URL", async () => {
    ascGet(
      "/v1/betaFeedbackScreenshotSubmissions/s1",
      screenshotSubmission("s1", [
        {
          url: `${CDN_ORIGIN}/a.png?sig=secret-A`,
          width: 100,
          height: 200,
          // Clearly in the future, so the proactive expiration gate downloads it.
          expirationDate: "2099-01-01T00:00:00Z",
        },
        { url: `${CDN_ORIGIN}/b.jpeg?sig=secret-B`, width: 10, height: 20 },
      ]),
    );
    const authA = cdnImage("/a.png", Buffer.from("AAAA"));
    const authB = cdnImage("/b.jpeg", Buffer.from("BBBBBB"));

    const saved = await downloadScreenshotFeedbackAttachments(
      client,
      "s1",
      dir,
      { retry: ZERO_BACKOFF },
    );

    // The critical security assertion: the Bearer token never reaches the CDN.
    expect(authA()).toBeUndefined();
    expect(authB()).toBeUndefined();
    expect(saved).toHaveLength(2);
    // Zero-padded, numbered, with the sniffed extension (jpeg normalized to jpg).
    expect(saved[0]?.path?.endsWith("screenshot-s1-00.png")).toBe(true);
    expect(saved[1]?.path?.endsWith("screenshot-s1-01.jpg")).toBe(true);
    expect(saved[0]?.bytesWritten).toBe(4);
    expect(saved[1]?.bytesWritten).toBe(6);
    expect(saved[0]?.width).toBe(100);
    expect(saved[0]?.expirationDate).toBe("2099-01-01T00:00:00Z");
    // The envelope carries only the de-queried URL, never the signature.
    const serialized = JSON.stringify(saved);
    expect(serialized).not.toContain("secret-A");
    expect(serialized).not.toContain("sig=");
    expect(saved[0]?.sanitizedUrl).toBe(`${CDN_ORIGIN}/a.png`);

    expect(await readFile(saved[0]?.path ?? "", "utf8")).toBe("AAAA");
  });

  it("treats a submission with no screenshots as not-found", async () => {
    ascGet(
      "/v1/betaFeedbackScreenshotSubmissions/s1",
      screenshotSubmission("s1", []),
    );

    const error = await thrownBy(
      downloadScreenshotFeedbackAttachments(client, "s1", dir),
    );

    expect(error).toBeInstanceOf(AscNotFoundError);
  });

  it("maps a CDN failure to the download file-processing stage (no checksum stage)", async () => {
    ascGet(
      "/v1/betaFeedbackScreenshotSubmissions/s1",
      screenshotSubmission("s1", [
        { url: `${CDN_ORIGIN}/expired.png?sig=stale` },
      ]),
    );
    // 403 simulates an expired signed URL.
    cdnImage("/expired.png", Buffer.from(""), 403);

    const error = await thrownBy(
      downloadScreenshotFeedbackAttachments(client, "s1", dir, {
        retry: ZERO_BACKOFF,
      }),
    );

    expect(error).toBeInstanceOf(AscFileProcessingError);
    expect((error as AscFileProcessingError).stage).toBe("download");
    // The target is de-queried; the signed query is never surfaced.
    expect(error.message).not.toContain("sig=");
  });

  it("skips an already-expired image WITHOUT issuing any CDN fetch", async () => {
    ascGet(
      "/v1/betaFeedbackScreenshotSubmissions/s1",
      screenshotSubmission("s1", [
        {
          url: `${CDN_ORIGIN}/expired.png?sig=stale`,
          width: 10,
          height: 20,
          // Clearly in the past: the proactive gate must skip it before fetch.
          expirationDate: "2000-01-01T00:00:00Z",
        },
      ]),
    );
    // No CDN interceptor is registered: net-connect is disabled, so any fetch
    // attempt would surface as a thrown download error rather than a clean
    // skip. The proactive gate must never reach the network for this image.

    const saved = await downloadScreenshotFeedbackAttachments(
      client,
      "s1",
      dir,
      { retry: ZERO_BACKOFF },
    );

    expect(saved).toHaveLength(1);
    expect(saved[0]?.skipped).toBe(true);
    expect(saved[0]?.path).toBeUndefined();
    expect(saved[0]?.reason).toContain("expired");
    expect(saved[0]?.expirationDate).toBe("2000-01-01T00:00:00Z");
    // Sanitized URL surfaces; the signed query never does.
    expect(saved[0]?.sanitizedUrl).toBe(`${CDN_ORIGIN}/expired.png`);
    expect(JSON.stringify(saved)).not.toContain("sig=");
  });

  it("flags an image that carries no URL as a download-stage upstream gap", async () => {
    ascGet(
      "/v1/betaFeedbackScreenshotSubmissions/s1",
      screenshotSubmission("s1", [{ width: 10 }]),
    );

    const error = await thrownBy(
      downloadScreenshotFeedbackAttachments(client, "s1", dir),
    );

    expect(error).toBeInstanceOf(AscFileProcessingError);
    expect((error as AscFileProcessingError).stage).toBe("download");
  });
});

// --- downloadCrashFeedbackLog ----------------------------------------------

describe("downloadCrashFeedbackLog", () => {
  it("reads the authenticated inlined log text and writes it to disk", async () => {
    ascGet(
      "/v1/betaFeedbackCrashSubmissions/c1/crashLog",
      crashLog("c1", "Thread 0 crashed\nfoo\n"),
    );

    const saved = await downloadCrashFeedbackLog(client, "c1", dir);

    expect(saved.path.endsWith("crash-c1.crash")).toBe(true);
    expect(await readFile(saved.path, "utf8")).toBe("Thread 0 crashed\nfoo\n");
    expect(saved.bytesWritten).toBeGreaterThan(0);
  });

  it("decodes a base64-gzip log before writing", async () => {
    const plain = "Crash report payload line one\nline two\n";
    const b64gz = gzipSync(Buffer.from(plain)).toString("base64");
    ascGet(
      "/v1/betaFeedbackCrashSubmissions/c1/crashLog",
      crashLog("c1", b64gz),
    );

    const saved = await downloadCrashFeedbackLog(client, "c1", dir);

    expect(await readFile(saved.path, "utf8")).toBe(plain);
  });

  it("treats an empty/absent log as not-found", async () => {
    ascGet(
      "/v1/betaFeedbackCrashSubmissions/c1/crashLog",
      crashLog("c1", undefined),
    );

    const error = await thrownBy(downloadCrashFeedbackLog(client, "c1", dir));

    expect(error).toBeInstanceOf(AscNotFoundError);
  });
});

// --- downloadFeedbackAttachments (batch orchestration) ----------------------

describe("downloadFeedbackAttachments", () => {
  it("enumerates an app's feedback and aggregates files + bytes across kinds", async () => {
    ascList("/v1/apps/app-1/betaFeedbackCrashSubmissions", [
      { type: "betaFeedbackCrashSubmissions", id: "c1" },
    ]);
    ascList("/v1/apps/app-1/betaFeedbackScreenshotSubmissions", [
      { type: "betaFeedbackScreenshotSubmissions", id: "s1" },
    ]);
    ascGet(
      "/v1/betaFeedbackCrashSubmissions/c1/crashLog",
      crashLog("c1", "log\n"),
    );
    ascGet(
      "/v1/betaFeedbackScreenshotSubmissions/s1",
      screenshotSubmission("s1", [{ url: `${CDN_ORIGIN}/x.png?sig=q` }]),
    );
    cdnImage("/x.png", Buffer.from("IMG"));

    const summary = await downloadFeedbackAttachments(
      client,
      { appId: "app-1", kinds: ["crash", "screenshot"] },
      dir,
      { retry: ZERO_BACKOFF },
    );

    expect(summary.submissions.map((s) => s.id)).toEqual(["c1", "s1"]);
    expect(summary.totals.files).toBe(2);
    expect(summary.totals.bytes).toBe("log\n".length + 3);
    // No signed URL anywhere in the batch summary.
    expect(JSON.stringify(summary)).not.toContain("sig=");
  });

  it("continues on a per-item failure, recording the error and proceeding", async () => {
    ascList("/v1/apps/app-1/betaFeedbackScreenshotSubmissions", [
      { type: "betaFeedbackScreenshotSubmissions", id: "s-bad" },
      { type: "betaFeedbackScreenshotSubmissions", id: "s-ok" },
    ]);
    ascGet(
      "/v1/betaFeedbackScreenshotSubmissions/s-bad",
      screenshotSubmission("s-bad", [
        { url: `${CDN_ORIGIN}/expired.png?sig=stale` },
      ]),
    );
    cdnImage("/expired.png", Buffer.from(""), 403);
    ascGet(
      "/v1/betaFeedbackScreenshotSubmissions/s-ok",
      screenshotSubmission("s-ok", [{ url: `${CDN_ORIGIN}/good.png?sig=q` }]),
    );
    cdnImage("/good.png", Buffer.from("OK"));

    const summary = await downloadFeedbackAttachments(
      client,
      { appId: "app-1", kinds: ["screenshot"] },
      dir,
      { retry: ZERO_BACKOFF },
    );

    const bad = summary.submissions.find((s) => s.id === "s-bad");
    const ok = summary.submissions.find((s) => s.id === "s-ok");
    expect(bad?.error).toBeDefined();
    expect(bad?.savedFiles).toEqual([]);
    expect(ok?.savedFiles).toHaveLength(1);
    expect(summary.totals.files).toBe(1);
    // A per-item error message must not leak the signed query.
    expect(JSON.stringify(summary)).not.toContain("sig=");
  });

  it("records an empty submission as skipped, not failed", async () => {
    ascGet(
      "/v1/betaFeedbackScreenshotSubmissions/s1",
      screenshotSubmission("s1", []),
    );

    const summary = await downloadFeedbackAttachments(
      client,
      { id: "s1", kind: "screenshot" },
      dir,
    );

    expect(summary.submissions[0]?.skipped).toBe(true);
    expect(summary.submissions[0]?.error).toBeUndefined();
    expect(summary.totals.files).toBe(0);
  });

  it("requires a kind alongside a single id", async () => {
    const error = await thrownBy(
      downloadFeedbackAttachments(client, { id: "s1" }, dir),
    );

    expect(error).toBeInstanceOf(AscFileProcessingError);
  });
});

// --- ensureBetaGroup (find-or-create) --------------------------------------

describe("ensureBetaGroup", () => {
  it("reuses an existing group by exact name and never POSTs", async () => {
    ascList("/v1/betaGroups", [
      { type: "betaGroups", id: "g-exist", attributes: { name: "Friends" } },
    ]);

    const result = await ensureBetaGroup(client, "app-1", "Friends");

    // No POST interceptor registered; assertNoPendingInterceptors proves it.
    expect(result.created).toBe(false);
    expect(result.group.id).toBe("g-exist");
  });

  it("creates the group when no name matches", async () => {
    ascList("/v1/betaGroups", []);
    const bodyOf = ascWrite("POST", "/v1/betaGroups", 201, {
      data: { type: "betaGroups", id: "g-new", attributes: { name: "New" } },
      links: { self: `${ASC_API_BASE_URL}/v1/betaGroups/g-new` },
    });

    const result = await ensureBetaGroup(client, "app-1", "New", {
      isInternalGroup: true,
    });

    expect(result.created).toBe(true);
    expect(result.group.id).toBe("g-new");
    expect(JSON.parse(bodyOf() ?? "{}")).toMatchObject({
      data: {
        attributes: { name: "New", isInternalGroup: true },
        relationships: { app: { data: { type: "apps", id: "app-1" } } },
      },
    });
  });
});

// --- localization upsert-by-locale -----------------------------------------

describe("localization upsert", () => {
  it("PATCHes a build localization when the locale already exists", async () => {
    ascList("/v1/betaBuildLocalizations", [
      {
        type: "betaBuildLocalizations",
        id: "l1",
        attributes: { locale: "en-US" },
      },
    ]);
    const bodyOf = ascWrite("PATCH", "/v1/betaBuildLocalizations/l1", 200, {
      data: { type: "betaBuildLocalizations", id: "l1" },
      links: { self: `${ASC_API_BASE_URL}/v1/betaBuildLocalizations/l1` },
    });

    const result = await upsertBetaBuildLocalization(
      client,
      "b1",
      "en-US",
      "Updated notes",
    );

    expect(result.created).toBe(false);
    expect(JSON.parse(bodyOf() ?? "{}")).toMatchObject({
      data: { id: "l1", attributes: { whatsNew: "Updated notes" } },
    });
  });

  it("POSTs a new build localization when the locale is absent", async () => {
    ascList("/v1/betaBuildLocalizations", []);
    const bodyOf = ascWrite("POST", "/v1/betaBuildLocalizations", 201, {
      data: { type: "betaBuildLocalizations", id: "l-new" },
      links: { self: `${ASC_API_BASE_URL}/v1/betaBuildLocalizations/l-new` },
    });

    const result = await upsertBetaBuildLocalization(
      client,
      "b1",
      "fr-FR",
      "Nouveau",
    );

    expect(result.created).toBe(true);
    expect(JSON.parse(bodyOf() ?? "{}")).toMatchObject({
      data: {
        attributes: { locale: "fr-FR", whatsNew: "Nouveau" },
        relationships: { build: { data: { type: "builds", id: "b1" } } },
      },
    });
  });

  it("POSTs a new app localization with the locale folded into create attributes", async () => {
    ascList("/v1/betaAppLocalizations", []);
    const bodyOf = ascWrite("POST", "/v1/betaAppLocalizations", 201, {
      data: { type: "betaAppLocalizations", id: "a-new" },
      links: { self: `${ASC_API_BASE_URL}/v1/betaAppLocalizations/a-new` },
    });

    const result = await upsertBetaAppLocalization(client, "app-1", "en-US", {
      description: "Beta",
    });

    expect(result.created).toBe(true);
    expect(JSON.parse(bodyOf() ?? "{}")).toMatchObject({
      data: {
        attributes: { locale: "en-US", description: "Beta" },
        relationships: { app: { data: { type: "apps", id: "app-1" } } },
      },
    });
  });
});

// --- find helpers ----------------------------------------------------------

describe("findBetaAppReviewDetail / findRecruitmentCriterionId", () => {
  it("resolves the review detail by app id", async () => {
    ascList("/v1/betaAppReviewDetails", [
      { type: "betaAppReviewDetails", id: "det-1" },
    ]);

    const detail = await findBetaAppReviewDetail(client, "app-1");

    expect(detail.id).toBe("det-1");
  });

  it("returns the recruitment criterion id, or undefined when none exists", async () => {
    ascGet("/v1/betaGroups/g1/betaRecruitmentCriteria", {
      data: { type: "betaRecruitmentCriteria", id: "c1" },
      links: { self: `${ASC_API_BASE_URL}/v1/x` },
    });

    const id = await findRecruitmentCriterionId(client, "g1");

    expect(id).toBe("c1");
  });

  it("returns undefined when the group has no criteria (null data)", async () => {
    ascGet("/v1/betaGroups/g1/betaRecruitmentCriteria", {
      data: null,
      links: { self: `${ASC_API_BASE_URL}/v1/x` },
    });

    const id = await findRecruitmentCriterionId(client, "g1");

    expect(id).toBeUndefined();
  });
});

// --- findLatestProcessedBuild (re-exported composition) --------------------

describe("findLatestProcessedBuild (workflow re-export)", () => {
  it("resolves the newest VALID build", async () => {
    ascList("/v1/builds", [{ type: "builds", id: "b-newest", attributes: {} }]);

    const build = await findLatestProcessedBuild(client, { appId: "app-1" });

    expect(build.id).toBe("b-newest");
  });
});
