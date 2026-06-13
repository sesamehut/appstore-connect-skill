import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AscFileProcessingError, AscUpstreamError } from "../errors.js";
import type { FetchLike } from "../http/transport.js";
import {
  computeFileMd5,
  readUploadFileMetadata,
  uploadFileParts,
} from "./media-files.js";
import type { UploadPartOperation } from "./media-files.js";

const ZERO_BACKOFF = {
  maxAttempts: 3,
  baseDelayMs: 1,
  maxDelayMs: 1,
  sleep: async (): Promise<void> => {
    await Promise.resolve();
  },
  random: (): number => 0,
} as const;

interface RecordedCall {
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
  readonly body: Buffer;
}

function recordingFetch(responder: (attempt: number) => Response): {
  fetchImpl: FetchLike;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = async (request) => {
    const body = Buffer.from(await request.arrayBuffer());
    calls.push({
      method: request.method,
      url: request.url,
      headers: new Headers(request.headers),
      body,
    });
    return responder(calls.length);
  };
  return { fetchImpl, calls };
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected the promise to reject");
  } catch (error) {
    return error;
  }
}

function md5Of(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("hex");
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "asc-media-files-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("readUploadFileMetadata", () => {
  it("returns the base name and byte size", async () => {
    const path = join(dir, "shot.png");
    await writeFile(path, Buffer.from("ABCDEFGHIJ"));

    expect(await readUploadFileMetadata(path)).toEqual({
      fileName: "shot.png",
      fileSize: 10,
    });
  });

  it("maps a missing file to a transfer-read error", async () => {
    const error = await captureError(
      readUploadFileMetadata(join(dir, "absent.png")),
    );
    expect(error).toBeInstanceOf(AscFileProcessingError);
    expect(error).toMatchObject({ stage: "transfer-read" });
  });

  it("rejects a directory as not a regular file", async () => {
    const error = await captureError(readUploadFileMetadata(dir));
    expect(error).toBeInstanceOf(AscFileProcessingError);
    expect(error).toMatchObject({ stage: "transfer-read" });
  });
});

describe("computeFileMd5", () => {
  it("matches a reference MD5 over the whole file", async () => {
    const bytes = Buffer.from("the quick brown fox");
    const path = join(dir, "data.bin");
    await writeFile(path, bytes);

    expect(await computeFileMd5(path)).toBe(md5Of(bytes));
  });

  it("maps a missing file to a transfer-read error", async () => {
    const error = await captureError(computeFileMd5(join(dir, "absent.bin")));
    expect(error).toBeInstanceOf(AscFileProcessingError);
    expect(error).toMatchObject({ stage: "transfer-read" });
  });
});

describe("uploadFileParts", () => {
  async function writeFixture(name: string, contents: string): Promise<string> {
    const path = join(dir, name);
    await writeFile(path, Buffer.from(contents));
    return path;
  }

  it("PUTs a single range without an authorization header, declaring its length", async () => {
    const path = await writeFixture("shot.png", "HELLO");
    const { fetchImpl, calls } = recordingFetch(() => new Response(null));
    const operation: UploadPartOperation = {
      url: "https://upload.example.test/p/0?sig=secret",
      method: "PUT",
      offset: 0,
      length: 5,
      requestHeaders: [{ name: "Content-Type", value: "image/png" }],
    };

    const result = await uploadFileParts(path, [operation], {
      fetch: fetchImpl,
    });

    expect(result).toEqual({ operationCount: 1, bytesTransferred: 5 });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.method).toBe("PUT");
    expect(call?.body.toString()).toBe("HELLO");
    expect(call?.headers.get("authorization")).toBeNull();
    expect(call?.headers.get("content-type")).toBe("image/png");
    expect(call?.headers.get("content-length")).toBe("5");
  });

  it("slices each operation's byte range from the file", async () => {
    const path = await writeFixture("multi.bin", "ABCDEFGHIJ");
    const { fetchImpl, calls } = recordingFetch(() => new Response(null));
    const operations: UploadPartOperation[] = [
      { url: "https://upload.example.test/p/0", offset: 0, length: 4 },
      { url: "https://upload.example.test/p/1", offset: 4, length: 6 },
    ];

    const result = await uploadFileParts(path, operations, {
      fetch: fetchImpl,
    });

    expect(result).toEqual({ operationCount: 2, bytesTransferred: 10 });
    expect(calls.map((call) => call.body.toString())).toEqual([
      "ABCD",
      "EFGHIJ",
    ]);
  });

  it("retries a 5xx with a fresh stream, then succeeds", async () => {
    const path = await writeFixture("retry.png", "HELLO");
    const { fetchImpl, calls } = recordingFetch((attempt) =>
      attempt === 1 ? new Response(null, { status: 503 }) : new Response(null),
    );

    const result = await uploadFileParts(
      path,
      [{ url: "https://upload.example.test/p/0", offset: 0, length: 5 }],
      { fetch: fetchImpl, retry: ZERO_BACKOFF },
    );

    expect(result.operationCount).toBe(1);
    expect(calls).toHaveLength(2);
    // Both attempts carry the full range — proof the ranged stream was rebuilt.
    expect(calls.map((call) => call.body.toString())).toEqual([
      "HELLO",
      "HELLO",
    ]);
  });

  it("exhausts retries on a persistent 5xx and strips the signed query from the target", async () => {
    const path = await writeFixture("fail.png", "HELLO");
    const { fetchImpl, calls } = recordingFetch(
      () => new Response(null, { status: 500 }),
    );

    const error = await captureError(
      uploadFileParts(
        path,
        [
          {
            url: "https://upload.example.test/p/0?sig=secret-token",
            offset: 0,
            length: 5,
          },
        ],
        { fetch: fetchImpl, retry: ZERO_BACKOFF },
      ),
    );

    expect(calls).toHaveLength(3);
    expect(error).toBeInstanceOf(AscFileProcessingError);
    expect(error).toMatchObject({
      stage: "transfer",
      target: "https://upload.example.test/p/0",
    });
    expect((error as Error).message).not.toContain("secret-token");
  });

  it("does not retry a non-429 4xx", async () => {
    const path = await writeFixture("forbidden.png", "HELLO");
    const { fetchImpl, calls } = recordingFetch(
      () => new Response(null, { status: 403 }),
    );

    const error = await captureError(
      uploadFileParts(
        path,
        [{ url: "https://upload.example.test/p/0", offset: 0, length: 5 }],
        { fetch: fetchImpl, retry: ZERO_BACKOFF },
      ),
    );

    expect(calls).toHaveLength(1);
    expect(error).toMatchObject({ stage: "transfer" });
  });

  it("rejects an empty operation list as an upstream error", async () => {
    const path = await writeFixture("shot.png", "HELLO");
    const error = await captureError(uploadFileParts(path, []));
    expect(error).toBeInstanceOf(AscUpstreamError);
  });

  it("rejects an operation missing its coordinates as an upstream error", async () => {
    const path = await writeFixture("shot.png", "HELLO");
    const { fetchImpl } = recordingFetch(() => new Response(null));
    const error = await captureError(
      uploadFileParts(path, [{ url: "https://upload.example.test/p/0" }], {
        fetch: fetchImpl,
      }),
    );
    expect(error).toBeInstanceOf(AscUpstreamError);
  });
});
