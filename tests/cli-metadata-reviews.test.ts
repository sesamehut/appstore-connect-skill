import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { runCli } from "../src/cli/main.js";
import { ASC_API_BASE_URL } from "../src/http/client.js";
import { JSON_HEADERS } from "./helpers/asc-fixtures.js";
import { useMockAgent } from "./helpers/mock-agent.js";
import { makeTestKey } from "./helpers/test-credentials.js";

const getAgent = useMockAgent();

let env: Record<string, string>;

beforeAll(async () => {
  env = (await makeTestKey()).envTeam;
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

function mockVersionLocalizations(): void {
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({
      path: (path) =>
        path.startsWith("/v1/appStoreVersions/v1/appStoreVersionLocalizations"),
      method: "GET",
    })
    .reply(
      200,
      {
        data: [
          {
            type: "appStoreVersionLocalizations",
            id: "loc-en",
            attributes: { locale: "en-US" },
          },
          {
            type: "appStoreVersionLocalizations",
            id: "loc-de",
            attributes: { locale: "de-DE" },
          },
        ],
        links: {
          self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1/appStoreVersionLocalizations`,
        },
      },
      { headers: JSON_HEADERS },
    );
}

describe("metadata version update", () => {
  it("resolves the locale to its localization and sends the PATCH body", async () => {
    mockVersionLocalizations();
    let capturedBody = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: "/v1/appStoreVersionLocalizations/loc-en",
        method: "PATCH",
      })
      .reply((request) => {
        capturedBody = request.body as string;
        return {
          statusCode: 200,
          data: {
            data: {
              type: "appStoreVersionLocalizations",
              id: "loc-en",
              attributes: { promotionalText: "Fresh!" },
            },
            links: {
              self: `${ASC_API_BASE_URL}/v1/appStoreVersionLocalizations/loc-en`,
            },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const captured = makeIo();
    const exit = await runCli(
      [
        "metadata",
        "version",
        "update",
        "--version",
        "v1",
        "--locale",
        "en-US",
        "--promotional-text",
        "Fresh!",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    expect(JSON.parse(capturedBody)).toEqual({
      data: {
        type: "appStoreVersionLocalizations",
        id: "loc-en",
        attributes: { promotionalText: "Fresh!" },
      },
    });
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      resolved: Record<string, string>;
    };
    expect(envelope.resolved).toEqual({
      appStoreVersionLocalization: "loc-en",
    });
  });

  it("merges --from-json with flags, flags winning", async () => {
    mockVersionLocalizations();
    let capturedBody = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: "/v1/appStoreVersionLocalizations/loc-en",
        method: "PATCH",
      })
      .reply((request) => {
        capturedBody = request.body as string;
        return {
          statusCode: 200,
          data: {
            data: { type: "appStoreVersionLocalizations", id: "loc-en" },
            links: {
              self: `${ASC_API_BASE_URL}/v1/appStoreVersionLocalizations/loc-en`,
            },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const directory = await mkdtemp(join(tmpdir(), "asc-cli-test-"));
    const file = join(directory, "copy.json");
    await writeFile(
      file,
      JSON.stringify({ description: "from file", whatsNew: null }),
      "utf8",
    );

    const captured = makeIo();
    const exit = await runCli(
      [
        "metadata",
        "version",
        "update",
        "--version",
        "v1",
        "--locale",
        "en-US",
        "--from-json",
        file,
        "--description",
        "from flag",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    expect(JSON.parse(capturedBody)).toEqual({
      data: {
        type: "appStoreVersionLocalizations",
        id: "loc-en",
        attributes: { description: "from flag", whatsNew: null },
      },
    });
  });

  it("answers a missing locale with not-found and the add-locale hint", async () => {
    mockVersionLocalizations();

    const captured = makeIo();
    const exit = await runCli(
      [
        "metadata",
        "version",
        "update",
        "--version",
        "v1",
        "--locale",
        "fr-FR",
        "--description",
        "Bonjour",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(3);
    expect(captured.out).toHaveLength(0);
    expect(captured.err[0]).toContain("error[not-found]:");
    expect(captured.err[0]).toContain("asc metadata version add-locale");
    expect(captured.err[0]).toContain("en-US, de-DE");
  });
});

describe("metadata version add-locale", () => {
  it("creates the localization with the relationship envelope", async () => {
    let capturedBody = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/appStoreVersionLocalizations", method: "POST" })
      .reply((request) => {
        capturedBody = request.body as string;
        return {
          statusCode: 201,
          data: {
            data: {
              type: "appStoreVersionLocalizations",
              id: "loc-fr",
              attributes: { locale: "fr-FR" },
            },
            links: {
              self: `${ASC_API_BASE_URL}/v1/appStoreVersionLocalizations/loc-fr`,
            },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const captured = makeIo();
    const exit = await runCli(
      [
        "metadata",
        "version",
        "add-locale",
        "--version",
        "v1",
        "--locale",
        "fr-FR",
        "--description",
        "Bonjour",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    expect(JSON.parse(capturedBody)).toEqual({
      data: {
        type: "appStoreVersionLocalizations",
        attributes: { locale: "fr-FR", description: "Bonjour" },
        relationships: {
          appStoreVersion: { data: { type: "appStoreVersions", id: "v1" } },
        },
      },
    });
  });
});

describe("metadata app update", () => {
  it("resolves the editable appInfo, then the locale, then patches", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) => path.startsWith("/v1/apps/123/appInfos"),
        method: "GET",
      })
      .reply(
        200,
        {
          data: [
            {
              type: "appInfos",
              id: "info-live",
              attributes: { state: "READY_FOR_DISTRIBUTION" },
            },
            {
              type: "appInfos",
              id: "info-edit",
              attributes: { state: "PREPARE_FOR_SUBMISSION" },
            },
          ],
          links: { self: `${ASC_API_BASE_URL}/v1/apps/123/appInfos` },
        },
        { headers: JSON_HEADERS },
      );
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) =>
          path.startsWith("/v1/appInfos/info-edit/appInfoLocalizations"),
        method: "GET",
      })
      .reply(
        200,
        {
          data: [
            {
              type: "appInfoLocalizations",
              id: "info-loc-en",
              attributes: { locale: "en-US" },
            },
          ],
          links: {
            self: `${ASC_API_BASE_URL}/v1/appInfos/info-edit/appInfoLocalizations`,
          },
        },
        { headers: JSON_HEADERS },
      );
    let capturedBody = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: "/v1/appInfoLocalizations/info-loc-en",
        method: "PATCH",
      })
      .reply((request) => {
        capturedBody = request.body as string;
        return {
          statusCode: 200,
          data: {
            data: {
              type: "appInfoLocalizations",
              id: "info-loc-en",
              attributes: { subtitle: "New subtitle" },
            },
            links: {
              self: `${ASC_API_BASE_URL}/v1/appInfoLocalizations/info-loc-en`,
            },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const captured = makeIo();
    const exit = await runCli(
      [
        "metadata",
        "app",
        "update",
        "--app",
        "123",
        "--locale",
        "en-US",
        "--subtitle",
        "New subtitle",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    expect(JSON.parse(capturedBody)).toEqual({
      data: {
        type: "appInfoLocalizations",
        id: "info-loc-en",
        attributes: { subtitle: "New subtitle" },
      },
    });
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      resolved: Record<string, string>;
    };
    expect(envelope.resolved).toEqual({
      appInfo: "info-edit",
      appInfoState: "PREPARE_FOR_SUBMISSION",
      appInfoLocalization: "info-loc-en",
    });
  });
});

describe("reviews", () => {
  it("maps --unanswered onto the exists filter", async () => {
    let capturedPath = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) => path.startsWith("/v1/apps/123/customerReviews"),
        method: "GET",
      })
      .reply((request) => {
        capturedPath = request.path;
        return {
          statusCode: 200,
          data: {
            data: [],
            links: { self: `${ASC_API_BASE_URL}/v1/apps/123/customerReviews` },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const captured = makeIo();
    const exit = await runCli(
      ["reviews", "list", "--app", "123", "--unanswered"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const query = new URLSearchParams(capturedPath.split("?")[1] ?? "");
    expect(query.get("exists[publishedResponse]")).toBe("false");
  });

  it("rejects --app together with --version as a usage error", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["reviews", "list", "--app", "123", "--version", "v1"],
      captured.io,
      {},
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("error[usage]:");
  });

  it("posts the developer response and requires exactly one body source", async () => {
    let capturedBody = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/customerReviewResponses", method: "POST" })
      .reply((request) => {
        capturedBody = request.body as string;
        return {
          statusCode: 201,
          data: {
            data: {
              type: "customerReviewResponses",
              id: "resp1",
              attributes: { responseBody: "Thanks!", state: "PENDING_PUBLISH" },
            },
            links: {
              self: `${ASC_API_BASE_URL}/v1/customerReviewResponses/resp1`,
            },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const captured = makeIo();
    const exit = await runCli(
      ["reviews", "respond", "--review", "r1", "--body", "Thanks!"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    expect(JSON.parse(capturedBody)).toEqual({
      data: {
        type: "customerReviewResponses",
        attributes: { responseBody: "Thanks!" },
        relationships: {
          review: { data: { type: "customerReviews", id: "r1" } },
        },
      },
    });

    const conflicting = makeIo();
    const usageExit = await runCli(
      ["reviews", "respond", "--review", "r1"],
      conflicting.io,
      {},
    );
    expect(usageExit).toBe(64);
  });
});
