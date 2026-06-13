import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/cli/main.js";
import { ASC_API_BASE_URL } from "../src/http/client.js";
import { JSON_HEADERS } from "./helpers/asc-fixtures.js";
import { headerValue, useMockAgent } from "./helpers/mock-agent.js";
import { makeTestKey } from "./helpers/test-credentials.js";

const getAgent = useMockAgent();
const CDN_ORIGIN = "https://feedback-cdn.example.test";

let env: Record<string, string>;
let dir: string;

beforeAll(async () => {
  env = (await makeTestKey()).envTeam;
});

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "asc-cli-tf-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function makeIo() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      out: (text: string) => out.push(text),
      err: (text: string) => err.push(text),
    },
    out,
    err,
  };
}

function ascGet(prefix: string, data: object | string): void {
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({ path: (path) => path.startsWith(prefix), method: "GET" })
    .reply(200, data, { headers: JSON_HEADERS });
}

// ---------------------------------------------------------------------------
// Argument validation: exit 64 BEFORE any network call. The mock agent rejects
// net connect, so a leaking request would surface as a different exit code.
// ---------------------------------------------------------------------------

describe("testflight argument validation (exit 64, no network)", () => {
  it("rejects --internal on groups update (create-only field)", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["testflight", "groups", "update", "g1", "--internal"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.out).toEqual([]);
    expect(captured.err[0]).toContain("internal");
  });

  it("rejects --all-builds on groups update (create-only field)", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["testflight", "groups", "update", "g1", "--all-builds"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("all-builds");
  });

  it("rejects a bad deviceFamily in criteria set --filter", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["testflight", "groups", "criteria", "set", "g1", "--filter", "PHONE:15"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("PHONE");
  });

  it("requires --force to delete a group", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["testflight", "groups", "delete", "g1"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("--force");
  });

  it("requires --force to add testers (it emails invitations)", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["testflight", "groups", "add-testers", "g1", "--testers", "t1"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("--force");
  });

  it("requires --force to enable a public link (exposes the app)", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["testflight", "groups", "public-link", "g1", "--enable"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("--force");
  });

  it("requires --force to create a tester (it may email an invitation)", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["testflight", "testers", "create", "--email", "a@x.com"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("--force");
  });

  it("rejects a download with neither --id nor --app", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["testflight", "feedback", "download", "--output", dir],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("--id");
  });

  it("rejects a download by --id without --kind", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["testflight", "feedback", "download", "--id", "s1", "--output", dir],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("--kind");
  });
});

// ---------------------------------------------------------------------------
// Success envelopes
// ---------------------------------------------------------------------------

describe("testflight groups list (success envelope)", () => {
  it("emits a list envelope with the correct pagination scope", async () => {
    ascGet("/v1/betaGroups", {
      data: [{ type: "betaGroups", id: "g1", attributes: { name: "Friends" } }],
      links: { self: `${ASC_API_BASE_URL}/v1/betaGroups` },
    });

    const captured = makeIo();
    const exit = await runCli(
      ["testflight", "groups", "list", "--app", "app-1"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      command: string;
      data: { id: string }[];
      pagination: { scope: string; truncated: boolean };
    };
    expect(envelope.command).toBe("testflight groups list");
    expect(envelope.data.map((g) => g.id)).toEqual(["g1"]);
    expect(envelope.pagination.scope).toBe("single-page");
  });
});

describe("testflight groups delete (reads members first, --force)", () => {
  it("reads the membership and reports the member count", async () => {
    ascGet("/v1/betaGroups/g1/betaTesters", {
      data: [
        { type: "betaTesters", id: "t1" },
        { type: "betaTesters", id: "t2" },
      ],
      links: { self: `${ASC_API_BASE_URL}/v1/betaGroups/g1/betaTesters` },
    });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/betaGroups/g1", method: "DELETE" })
      .reply(204, "");

    const captured = makeIo();
    const exit = await runCli(
      ["testflight", "groups", "delete", "g1", "--force"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      data: { id: string; deleted: boolean; memberCount: number };
    };
    expect(envelope.data).toEqual({
      id: "g1",
      deleted: true,
      memberCount: 2,
    });
  });
});

describe("testflight testers delete (async accepted envelope)", () => {
  it("reports deleteAccepted on a 202 without asserting immediate gone", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/betaTesters/t1", method: "DELETE" })
      .reply(202, "");

    const captured = makeIo();
    const exit = await runCli(
      ["testflight", "testers", "delete", "t1", "--force"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      data: { id: string; deleteAccepted: boolean };
    };
    expect(envelope.data).toEqual({ id: "t1", deleteAccepted: true });
  });
});

describe("testflight feedback get-screenshot (signed URLs de-queried, never echoed)", () => {
  it("sanitizes every screenshots[].url to origin+path and leaks no signature", async () => {
    ascGet("/v1/betaFeedbackScreenshotSubmissions/s1", {
      data: {
        type: "betaFeedbackScreenshotSubmissions",
        id: "s1",
        attributes: {
          deviceModel: "iPhone15,3",
          screenshots: [
            {
              url: `${CDN_ORIGIN}/shot.png?sig=super-secret`,
              width: 100,
              height: 200,
              expirationDate: "2026-06-13T00:00:00Z",
            },
          ],
        },
      },
      links: {
        self: `${ASC_API_BASE_URL}/v1/betaFeedbackScreenshotSubmissions/s1`,
      },
    });

    const captured = makeIo();
    const exit = await runCli(
      ["testflight", "feedback", "get-screenshot", "--id", "s1"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const raw = captured.out[0] ?? "";
    const envelope = JSON.parse(raw) as {
      command: string;
      data: {
        id: string;
        attributes: {
          screenshots: {
            url?: string;
            sanitizedUrl?: string;
            width?: number;
            height?: number;
            expirationDate?: string;
          }[];
        };
      };
    };
    expect(envelope.command).toBe("testflight feedback get-screenshot");
    expect(envelope.data.id).toBe("s1");
    const shot = envelope.data.attributes.screenshots[0];
    // The raw signed URL is dropped; only the de-queried origin+path survives,
    // and width/height/expirationDate are kept.
    expect(shot?.url).toBeUndefined();
    expect(shot?.sanitizedUrl).toBe(`${CDN_ORIGIN}/shot.png`);
    expect(shot?.width).toBe(100);
    expect(shot?.expirationDate).toBe("2026-06-13T00:00:00Z");
    // The signature must not appear ANYWHERE in the emitted stdout.
    expect(raw).not.toContain("super-secret");
    expect(raw).not.toContain("sig=");
  });
});

describe("testflight feedback list-screenshots (signed URLs de-queried, never echoed)", () => {
  it("sanitizes every item's screenshots[].url before enveloping", async () => {
    ascGet("/v1/apps/app-1/betaFeedbackScreenshotSubmissions", {
      data: [
        {
          type: "betaFeedbackScreenshotSubmissions",
          id: "s1",
          attributes: {
            screenshots: [
              {
                url: `${CDN_ORIGIN}/one.png?sig=super-secret`,
                width: 10,
                height: 20,
                expirationDate: "2026-06-13T00:00:00Z",
              },
            ],
          },
        },
      ],
      links: {
        self: `${ASC_API_BASE_URL}/v1/apps/app-1/betaFeedbackScreenshotSubmissions`,
      },
    });

    const captured = makeIo();
    const exit = await runCli(
      ["testflight", "feedback", "list-screenshots", "--app", "app-1"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const raw = captured.out[0] ?? "";
    const envelope = JSON.parse(raw) as {
      command: string;
      data: {
        attributes: { screenshots: { url?: string; sanitizedUrl?: string }[] };
      }[];
    };
    expect(envelope.command).toBe("testflight feedback list-screenshots");
    const shot = envelope.data[0]?.attributes.screenshots[0];
    expect(shot?.url).toBeUndefined();
    expect(shot?.sanitizedUrl).toBe(`${CDN_ORIGIN}/one.png`);
    // No signature anywhere in the list envelope.
    expect(raw).not.toContain("super-secret");
    expect(raw).not.toContain("sig=");
  });
});

// ---------------------------------------------------------------------------
// Download to disk: bytes land AND the envelope JSON carries no signed URL.
// ---------------------------------------------------------------------------

describe("testflight feedback download (bytes on disk, no signed URL in envelope)", () => {
  it("downloads a screenshot auth-free and emits on-disk paths only", async () => {
    ascGet("/v1/betaFeedbackScreenshotSubmissions/s1", {
      data: {
        type: "betaFeedbackScreenshotSubmissions",
        id: "s1",
        attributes: {
          screenshots: [
            {
              url: `${CDN_ORIGIN}/shot.png?sig=super-secret`,
              width: 100,
              height: 200,
              // Future date so the proactive expiration gate still downloads it.
              expirationDate: "2099-01-01T00:00:00Z",
            },
          ],
        },
      },
      links: {
        self: `${ASC_API_BASE_URL}/v1/betaFeedbackScreenshotSubmissions/s1`,
      },
    });
    let auth: string | undefined = "UNSET";
    getAgent()
      .get(CDN_ORIGIN)
      .intercept({ path: (p) => p.startsWith("/shot.png"), method: "GET" })
      .reply((request) => {
        auth = headerValue(request.headers, "authorization");
        return { statusCode: 200, data: Buffer.from("PNGBYTES") };
      });

    const captured = makeIo();
    const exit = await runCli(
      [
        "testflight",
        "feedback",
        "download",
        "--id",
        "s1",
        "--kind",
        "screenshot",
        "--output",
        dir,
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    // The token must never have reached the CDN host.
    expect(auth).toBeUndefined();

    const raw = captured.out[0] ?? "";
    const envelope = JSON.parse(raw) as {
      command: string;
      data: {
        outputDir: string;
        submissions: {
          id: string;
          kind: string;
          savedFiles: { path: string; sanitizedUrl?: string }[];
        }[];
        totals: { files: number; bytes: number };
      };
    };
    expect(envelope.command).toBe("testflight feedback download");
    expect(envelope.data.totals.files).toBe(1);
    expect(envelope.data.totals.bytes).toBe("PNGBYTES".length);

    const savedPath = envelope.data.submissions[0]?.savedFiles[0]?.path ?? "";
    expect(await readFile(savedPath, "utf8")).toBe("PNGBYTES");
    expect(envelope.data.submissions[0]?.savedFiles[0]?.sanitizedUrl).toBe(
      `${CDN_ORIGIN}/shot.png`,
    );

    // The signed URL and its signature must not appear ANYWHERE in the JSON.
    expect(raw).not.toContain("super-secret");
    expect(raw).not.toContain("sig=");
  });

  it("downloads a crash log from the authenticated JSON to disk", async () => {
    ascGet("/v1/betaFeedbackCrashSubmissions/c1/crashLog", {
      data: {
        type: "betaCrashLogs",
        id: "log-c1",
        attributes: { logText: "Thread 0 crashed\n" },
      },
      links: {
        self: `${ASC_API_BASE_URL}/v1/betaFeedbackCrashSubmissions/c1/crashLog`,
      },
    });

    const captured = makeIo();
    const exit = await runCli(
      [
        "testflight",
        "feedback",
        "download",
        "--id",
        "c1",
        "--kind",
        "crash",
        "--output",
        dir,
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      data: { submissions: { savedFiles: { path: string }[] }[] };
    };
    const savedPath = envelope.data.submissions[0]?.savedFiles[0]?.path ?? "";
    expect(await readFile(savedPath, "utf8")).toBe("Thread 0 crashed\n");
  });

  it("records a per-item download-stage failure (continue-on-error) but exits 3 (most-severe)", async () => {
    ascGet("/v1/betaFeedbackScreenshotSubmissions/s1", {
      data: {
        type: "betaFeedbackScreenshotSubmissions",
        id: "s1",
        attributes: {
          screenshots: [{ url: `${CDN_ORIGIN}/expired.png?sig=stale` }],
        },
      },
      links: {
        self: `${ASC_API_BASE_URL}/v1/betaFeedbackScreenshotSubmissions/s1`,
      },
    });
    // A 403 stands in for an expired signed URL: the download fails per-item.
    getAgent()
      .get(CDN_ORIGIN)
      .intercept({ path: (p) => p.startsWith("/expired.png"), method: "GET" })
      .reply(403, "");

    const captured = makeIo();
    const exit = await runCli(
      [
        "testflight",
        "feedback",
        "download",
        "--id",
        "s1",
        "--kind",
        "screenshot",
        "--output",
        dir,
      ],
      captured.io,
      env,
    );

    // continue-on-error keeps the populated envelope, but the batch exit code
    // takes the most-severe per-item result: a real failure means exit 3.
    expect(exit).toBe(3);
    const raw = captured.out[0] ?? "";
    const envelope = JSON.parse(raw) as {
      ok: boolean;
      data: {
        submissions: { error?: string; savedFiles: unknown[] }[];
        totals: { files: number };
      };
    };
    // The envelope still documents the completed batch (ok:true + full detail).
    expect(envelope.ok).toBe(true);
    expect(envelope.data.submissions[0]?.error).toBeDefined();
    expect(envelope.data.submissions[0]?.savedFiles).toEqual([]);
    expect(envelope.data.totals.files).toBe(0);
    // Even the recorded error message must not leak the signed query.
    expect(raw).not.toContain("sig=");
  });

  it("exits 3 on partial success (one ok, one failed — most-severe wins)", async () => {
    ascGet("/v1/apps/app-1/betaFeedbackScreenshotSubmissions", {
      data: [
        { type: "betaFeedbackScreenshotSubmissions", id: "s-ok" },
        { type: "betaFeedbackScreenshotSubmissions", id: "s-bad" },
      ],
      links: {
        self: `${ASC_API_BASE_URL}/v1/apps/app-1/betaFeedbackScreenshotSubmissions`,
      },
    });
    ascGet("/v1/betaFeedbackScreenshotSubmissions/s-ok", {
      data: {
        type: "betaFeedbackScreenshotSubmissions",
        id: "s-ok",
        attributes: { screenshots: [{ url: `${CDN_ORIGIN}/good.png?sig=q` }] },
      },
      links: {
        self: `${ASC_API_BASE_URL}/v1/betaFeedbackScreenshotSubmissions/s-ok`,
      },
    });
    ascGet("/v1/betaFeedbackScreenshotSubmissions/s-bad", {
      data: {
        type: "betaFeedbackScreenshotSubmissions",
        id: "s-bad",
        attributes: { screenshots: [{ url: `${CDN_ORIGIN}/bad.png?sig=q` }] },
      },
      links: {
        self: `${ASC_API_BASE_URL}/v1/betaFeedbackScreenshotSubmissions/s-bad`,
      },
    });
    getAgent()
      .get(CDN_ORIGIN)
      .intercept({ path: (p) => p.startsWith("/good.png"), method: "GET" })
      .reply(200, Buffer.from("OK"));
    getAgent()
      .get(CDN_ORIGIN)
      .intercept({ path: (p) => p.startsWith("/bad.png"), method: "GET" })
      .reply(403, "");

    const captured = makeIo();
    const exit = await runCli(
      [
        "testflight",
        "feedback",
        "download",
        "--app",
        "app-1",
        "--kind",
        "screenshot",
        "--output",
        dir,
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(3);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      data: { totals: { files: number } };
    };
    // The one good download still landed (continue-on-error), but the batch
    // exit is governed by the single failure.
    expect(envelope.data.totals.files).toBe(1);
  });

  it("passes --device-model/--os-version/--sort through to the --app list call", async () => {
    let listPath: string | undefined;
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (p) =>
          p.startsWith("/v1/apps/app-1/betaFeedbackScreenshotSubmissions"),
        method: "GET",
      })
      .reply((request) => {
        listPath = request.path;
        return {
          statusCode: 200,
          data: {
            data: [],
            links: {
              self: `${ASC_API_BASE_URL}/v1/apps/app-1/betaFeedbackScreenshotSubmissions`,
            },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const captured = makeIo();
    const exit = await runCli(
      [
        "testflight",
        "feedback",
        "download",
        "--app",
        "app-1",
        "--kind",
        "screenshot",
        "--device-model",
        "iPhone15,3",
        "--os-version",
        "17.0",
        "--sort",
        "-createdDate",
        "--output",
        dir,
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const decoded = decodeURIComponent(listPath ?? "");
    expect(decoded).toContain("filter[deviceModel]=iPhone15,3");
    expect(decoded).toContain("filter[osVersion]=17.0");
    expect(decoded).toContain("sort=-createdDate");
  });

  it("exits 0 when every per-item download succeeds", async () => {
    ascGet("/v1/betaFeedbackScreenshotSubmissions/s1", {
      data: {
        type: "betaFeedbackScreenshotSubmissions",
        id: "s1",
        attributes: { screenshots: [{ url: `${CDN_ORIGIN}/ok.png?sig=q` }] },
      },
      links: {
        self: `${ASC_API_BASE_URL}/v1/betaFeedbackScreenshotSubmissions/s1`,
      },
    });
    getAgent()
      .get(CDN_ORIGIN)
      .intercept({ path: (p) => p.startsWith("/ok.png"), method: "GET" })
      .reply(200, Buffer.from("OK"));

    const captured = makeIo();
    const exit = await runCli(
      [
        "testflight",
        "feedback",
        "download",
        "--id",
        "s1",
        "--kind",
        "screenshot",
        "--output",
        dir,
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
  });
});
