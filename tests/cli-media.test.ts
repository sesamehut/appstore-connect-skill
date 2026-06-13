import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/cli/main.js";
import { ASC_API_BASE_URL } from "../src/http/client.js";
import { JSON_HEADERS } from "./helpers/asc-fixtures.js";
import { useMockAgent } from "./helpers/mock-agent.js";
import { makeTestKey } from "./helpers/test-credentials.js";

const getAgent = useMockAgent();
const UPLOAD_ORIGIN = "https://upload.example.test";

let env: Record<string, string>;
let dir: string;

beforeAll(async () => {
  env = (await makeTestKey()).envTeam;
});

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "asc-cli-media-"));
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

async function tempFile(name: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, Buffer.from("PNGBYTES-01"));
  return path;
}

describe("media argument validation (exit 64, no network)", () => {
  it("rejects an unknown screenshot display type", async () => {
    const file = await tempFile("shot.png");
    const captured = makeIo();
    const exit = await runCli(
      [
        "media",
        "screenshots",
        "upload",
        "--version",
        "ver-1",
        "--locale",
        "en-US",
        "--display-type",
        "APP_IPHONE_9000",
        "--file",
        file,
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.out).toEqual([]);
    expect(captured.err[0]).toContain("display-type");
  });

  it("rejects a --file that does not exist", async () => {
    const captured = makeIo();
    const exit = await runCli(
      [
        "media",
        "screenshots",
        "upload",
        "--version",
        "ver-1",
        "--locale",
        "en-US",
        "--display-type",
        "APP_IPHONE_67",
        "--file",
        join(dir, "absent.png"),
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("--file");
  });

  it("rejects a malformed preview frame timecode", async () => {
    const captured = makeIo();
    const exit = await runCli(
      [
        "media",
        "previews",
        "upload",
        "--version",
        "ver-1",
        "--locale",
        "en-US",
        "--preview-type",
        "IPHONE_67",
        "--file",
        join(dir, "absent.mov"),
        "--frame-time-code",
        "5 seconds",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("frame-time-code");
  });

  it("rejects a --order list with duplicate ids", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["media", "screenshots", "reorder", "--set", "set-1", "--order", "a,b,a"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("more than once");
  });

  it("rejects an upload-set directory with no images", async () => {
    const captured = makeIo();
    const exit = await runCli(
      [
        "media",
        "screenshots",
        "upload-set",
        "--version",
        "ver-1",
        "--locale",
        "en-US",
        "--display-type",
        "APP_IPHONE_67",
        "--dir",
        dir,
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("no");
  });
});

describe("media screenshots upload (success envelope)", () => {
  it("walks the chain and emits a resolved block with no signed upload URL", async () => {
    const file = await tempFile("shot.png");

    const localization = {
      type: "appStoreVersionLocalizations",
      id: "loc-1",
      attributes: { locale: "en-US" },
    };
    const set = {
      type: "appScreenshotSets",
      id: "set-1",
      attributes: { screenshotDisplayType: "APP_IPHONE_67" },
    };
    const reserved = {
      type: "appScreenshots",
      id: "shot-1",
      attributes: {
        fileName: "shot.png",
        fileSize: 11,
        assetDeliveryState: { state: "AWAITING_UPLOAD" },
        uploadOperations: [
          {
            url: `${UPLOAD_ORIGIN}/up/0?sig=super-secret`,
            method: "PUT",
            offset: 0,
            length: 11,
            requestHeaders: [{ name: "Content-Type", value: "image/png" }],
          },
        ],
      },
    };
    // The confirmed resource Apple returns no longer carries the upload ops.
    const confirmed = {
      type: "appScreenshots",
      id: "shot-1",
      attributes: {
        fileName: "shot.png",
        fileSize: 11,
        assetDeliveryState: { state: "COMPLETE" },
      },
    };

    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (p) => p.includes("/appStoreVersionLocalizations"),
        method: "GET",
      })
      .reply(
        200,
        { data: [localization], links: { self: `${ASC_API_BASE_URL}/v1/x` } },
        { headers: JSON_HEADERS },
      );
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (p) =>
          p.startsWith(
            "/v1/appStoreVersionLocalizations/loc-1/appScreenshotSets",
          ),
        method: "GET",
      })
      .reply(
        200,
        { data: [set], links: { self: `${ASC_API_BASE_URL}/v1/x` } },
        { headers: JSON_HEADERS },
      );
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/appScreenshots", method: "POST" })
      .reply(201, { data: reserved }, { headers: JSON_HEADERS });
    getAgent()
      .get(UPLOAD_ORIGIN)
      .intercept({ path: (p) => p.startsWith("/up/0"), method: "PUT" })
      .reply(200, "");
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/appScreenshots/shot-1", method: "PATCH" })
      .reply(
        200,
        {
          data: {
            ...reserved,
            attributes: {
              ...confirmed.attributes,
              assetDeliveryState: { state: "UPLOAD_COMPLETE" },
            },
          },
        },
        { headers: JSON_HEADERS },
      );
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/appScreenshots/shot-1", method: "GET" })
      .reply(200, { data: confirmed }, { headers: JSON_HEADERS });

    const captured = makeIo();
    const exit = await runCli(
      [
        "media",
        "screenshots",
        "upload",
        "--version",
        "ver-1",
        "--locale",
        "en-US",
        "--display-type",
        "APP_IPHONE_67",
        "--file",
        file,
        "--timeout",
        "1",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const raw = captured.out[0] ?? "";
    const envelope = JSON.parse(raw) as {
      command: string;
      resolved: Record<string, unknown>;
    };
    expect(envelope.command).toBe("media screenshots upload");
    expect(envelope.resolved).toMatchObject({
      versionId: "ver-1",
      locale: "en-US",
      localizationId: "loc-1",
      displayType: "APP_IPHONE_67",
      setId: "set-1",
      setCreated: false,
      assetId: "shot-1",
      complete: true,
      finalState: "COMPLETE",
    });
    // The signed upload URL must never appear anywhere in the emitted JSON.
    expect(raw).not.toContain("super-secret");
    expect(raw).not.toContain(UPLOAD_ORIGIN);
  });
});

describe("media screenshots delete", () => {
  it("deletes by id and reports the deletion", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/appScreenshots/shot-9", method: "DELETE" })
      .reply(204, "");

    const captured = makeIo();
    const exit = await runCli(
      ["media", "screenshots", "delete", "shot-9"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      data: { id: string; deleted: boolean };
    };
    expect(envelope.data).toEqual({ id: "shot-9", deleted: true });
  });
});
