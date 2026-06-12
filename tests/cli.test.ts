import { beforeAll, describe, expect, it } from "vitest";

import { runCli } from "../src/cli/main.js";
import { ASC_API_BASE_URL } from "../src/http/client.js";
import { ascItem, JSON_HEADERS } from "./helpers/asc-fixtures.js";
import { useMockAgent } from "./helpers/mock-agent.js";
import { makeTestKey } from "./helpers/test-credentials.js";

const getAgent = useMockAgent();

let env: Record<string, string>;

beforeAll(async () => {
  env = (await makeTestKey()).envTeam;
});

interface CapturedIo {
  readonly io: { out: (text: string) => void; err: (text: string) => void };
  readonly out: string[];
  readonly err: string[];
}

function makeIo(): CapturedIo {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      out: (text) => out.push(text),
      err: (text) => err.push(text),
    },
    out,
    err,
  };
}

function parseEnvelope(captured: CapturedIo): Record<string, unknown> {
  expect(captured.out).toHaveLength(1);
  return JSON.parse(captured.out[0] ?? "") as Record<string, unknown>;
}

describe("result envelope", () => {
  it("reports pagination honestly on an --all read across pages", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps?limit=1", method: "GET" })
      .reply(
        200,
        {
          data: [{ type: "apps", id: "1" }],
          links: {
            self: `${ASC_API_BASE_URL}/v1/apps`,
            next: `${ASC_API_BASE_URL}/v1/apps?cursor=p2&limit=1`,
          },
          meta: { paging: { limit: 1, total: 2 } },
        },
        { headers: JSON_HEADERS },
      );
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps?cursor=p2&limit=1", method: "GET" })
      .reply(
        200,
        {
          data: [{ type: "apps", id: "2" }],
          links: { self: `${ASC_API_BASE_URL}/v1/apps` },
          meta: { paging: { limit: 1, total: 2 } },
        },
        { headers: JSON_HEADERS },
      );

    const captured = makeIo();
    const code = await runCli(
      ["apps", "list", "--all", "--page-limit", "1"],
      captured.io,
      env,
    );

    expect(code).toBe(0);
    const envelope = parseEnvelope(captured);
    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe("apps list");
    expect(envelope.data).toHaveLength(2);
    expect(envelope.pagination).toEqual({
      pagesRead: 2,
      total: 2,
      truncated: false,
      scope: "all-pages",
    });
  });

  it("marks a --max-items read as truncated when more data exists", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/apps?limit=1", method: "GET" })
      .reply(
        200,
        {
          data: [{ type: "apps", id: "1" }],
          links: {
            self: `${ASC_API_BASE_URL}/v1/apps`,
            next: `${ASC_API_BASE_URL}/v1/apps?cursor=p2&limit=1`,
          },
        },
        { headers: JSON_HEADERS },
      );

    const captured = makeIo();
    const code = await runCli(
      ["apps", "list", "--max-items", "1", "--page-limit", "1"],
      captured.io,
      env,
    );

    expect(code).toBe(0);
    const envelope = parseEnvelope(captured);
    expect(envelope.pagination).toMatchObject({
      truncated: true,
      scope: { maxItems: 1 },
    });
  });
});

describe("error funnel", () => {
  it.each([
    [403, "FORBIDDEN_ERROR", "permission"],
    [404, "NOT_FOUND", "not-found"],
    [400, "PARAMETER_ERROR.INVALID", "invalid-parameter"],
  ])(
    "maps a %i to exit 3 with an error[%s] line and empty stdout",
    async (status, code, category) => {
      getAgent()
        .get(ASC_API_BASE_URL)
        .intercept({ path: "/v1/apps", method: "GET" })
        .reply(
          status,
          { errors: [ascItem({ code, status: String(status) })] },
          { headers: JSON_HEADERS },
        );

      const captured = makeIo();
      const exit = await runCli(["apps", "list"], captured.io, env);

      expect(exit).toBe(3);
      expect(captured.out).toHaveLength(0);
      expect(captured.err[0]).toContain(`error[${category}]:`);
      expect(captured.err.some((line) => line.startsWith("hint:"))).toBe(true);
    },
  );

  it("maps missing credentials to exit 2 with the env-var fix", async () => {
    const captured = makeIo();
    const exit = await runCli(["apps", "list"], captured.io, {});

    expect(exit).toBe(2);
    expect(captured.out).toHaveLength(0);
    expect(captured.err[0]).toContain("error[credential]:");
    expect(captured.err.join("\n")).toContain("ASC_KEY_ID");
  });

  it("maps conflicting scope flags to exit 64 without touching the network", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["apps", "list", "--all", "--max-items", "2"],
      captured.io,
      {},
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("error[usage]:");
  });

  it("maps an unknown command to exit 64", async () => {
    const captured = makeIo();
    const exit = await runCli(["nope"], captured.io, {});

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("Unknown command");
  });

  it("maps a missing required flag to exit 64 via citty's validation", async () => {
    const captured = makeIo();
    const exit = await runCli(["versions", "list"], captured.io, {});

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("error[usage]:");
  });
});

describe("planned and unsupported boundaries", () => {
  it.each([
    ["reports", "M5"],
    ["media", "M6"],
    ["testflight", "M7"],
  ])(
    "answers '%s' with exit 5 naming milestone %s, even with trailing args",
    async (domain, milestone) => {
      const captured = makeIo();
      const exit = await runCli([domain, "anything", "goes"], captured.io, {});

      expect(exit).toBe(5);
      expect(captured.out).toHaveLength(0);
      expect(captured.err[0]).toContain("error[not-implemented]:");
      expect(captured.err[0]).toContain(milestone);
    },
  );

  it("lists implemented, planned, and API-unsupported tasks via capabilities", async () => {
    const captured = makeIo();
    const exit = await runCli(["capabilities"], captured.io, {});

    expect(exit).toBe(0);
    const envelope = parseEnvelope(captured);
    const data = envelope.data as {
      implemented: { name: string }[];
      planned: { name: string; milestone: string }[];
      unsupportedByAppleApi: { task: string; guidance: string }[];
    };
    expect(data.implemented.map((entry) => entry.name)).toContain("metadata");
    expect(data.planned).toContainEqual(
      expect.objectContaining({ name: "reports", milestone: "M5" }),
    );
    expect(data.unsupportedByAppleApi.length).toBeGreaterThan(0);
  });
});

describe("--help", () => {
  it("renders root usage with implemented and planned domains, exit 0", async () => {
    const captured = makeIo();
    const exit = await runCli(["--help"], captured.io, {});

    expect(exit).toBe(0);
    const usage = captured.out.join("\n");
    expect(usage).toContain("apps");
    expect(usage).toContain("metadata");
    expect(usage).toContain("reports");
    expect(usage).toContain("not yet implemented");
  });

  it("renders leaf usage with the leaf's flags", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["metadata", "version", "update", "--help"],
      captured.io,
      {},
    );

    expect(exit).toBe(0);
    const usage = captured.out.join("\n");
    expect(usage).toContain("promotional-text");
    expect(usage).toContain("from-json");
  });
});

describe("doctor", () => {
  it("fails with actionable fixes when credentials are missing", async () => {
    const captured = makeIo();
    const exit = await runCli(["doctor"], captured.io, {});

    expect(exit).toBe(2);
    const report = parseEnvelope(captured);
    expect(report.ok).toBe(false);
    const checks = (
      report.data as {
        checks: { name: string; status: string; fix?: string }[];
      }
    ).checks;
    const credentials = checks.find((check) => check.name === "credentials");
    expect(credentials?.status).toBe("fail");
    expect(credentials?.fix).toContain("ASC_KEY_ID");
  });

  it("passes offline with a complete fake environment", async () => {
    const captured = makeIo();
    const exit = await runCli(["doctor"], captured.io, env);

    expect(exit).toBe(0);
    const report = parseEnvelope(captured);
    expect(report.ok).toBe(true);
  });
});
