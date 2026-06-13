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

function ascGet(prefix: string, data: object | string): void {
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({ path: (path) => path.startsWith(prefix), method: "GET" })
    .reply(200, data, { headers: JSON_HEADERS });
}

function captureWrite(
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

// ---------------------------------------------------------------------------
// Argument validation: exit 64 before any network call.
// ---------------------------------------------------------------------------

describe("builds argument validation (exit 64, no network)", () => {
  it("requires --force to expire a build (irreversible)", async () => {
    const captured = makeIo();
    const exit = await runCli(["builds", "expire", "b1"], captured.io, env);

    expect(exit).toBe(64);
    expect(captured.out).toEqual([]);
    expect(captured.err[0]).toContain("--force");
  });

  it("requires --force to submit a build for beta review (real Apple review)", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["builds", "review", "submit", "b1"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("--force");
  });

  it("requires --force to distribute a build to groups (side effect)", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["builds", "groups", "add", "b1", "--group", "g1"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("--force");
  });

  it("requires --force to add individual testers to a build", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["builds", "testers", "add", "b1", "--tester", "t1"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("--force");
  });

  it("rejects a non-true/false --auto-notify value", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["builds", "beta-detail", "set", "b1", "--auto-notify", "maybe"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("auto-notify");
  });

  it("rejects a relationship edit with a duplicated id", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["builds", "groups", "remove", "b1", "--group", "g1,g1", "--force"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("more than once");
  });
});

// ---------------------------------------------------------------------------
// Success envelopes
// ---------------------------------------------------------------------------

describe("builds list (success envelope, pagination scope)", () => {
  it("emits a list envelope at single-page scope by default", async () => {
    ascGet("/v1/builds", {
      data: [{ type: "builds", id: "b1", attributes: { version: "100" } }],
      links: { self: `${ASC_API_BASE_URL}/v1/builds` },
    });

    const captured = makeIo();
    const exit = await runCli(
      ["builds", "list", "--app", "app-1", "--processing-state", "VALID"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      command: string;
      data: { id: string }[];
      pagination: { scope: string };
    };
    expect(envelope.command).toBe("builds list");
    expect(envelope.data.map((b) => b.id)).toEqual(["b1"]);
    expect(envelope.pagination.scope).toBe("single-page");
  });
});

describe("builds latest (resolved chain)", () => {
  it("resolves the newest VALID build and reports the resolved buildId", async () => {
    ascGet("/v1/builds", {
      data: [{ type: "builds", id: "b-newest", attributes: {} }],
      links: { self: `${ASC_API_BASE_URL}/v1/builds` },
    });

    const captured = makeIo();
    const exit = await runCli(
      ["builds", "latest", "--app", "app-1"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      command: string;
      data: { id: string };
      resolved: { appId: string; buildId: string };
    };
    expect(envelope.command).toBe("builds latest");
    expect(envelope.resolved).toEqual({ appId: "app-1", buildId: "b-newest" });
    expect(envelope.data.id).toBe("b-newest");
  });

  it("maps a no-build miss to the request exit code (3)", async () => {
    ascGet("/v1/builds", {
      data: [],
      links: { self: `${ASC_API_BASE_URL}/v1/builds` },
    });

    const captured = makeIo();
    const exit = await runCli(
      ["builds", "latest", "--app", "app-1"],
      captured.io,
      env,
    );

    expect(exit).toBe(3);
    expect(captured.out).toEqual([]);
    expect(captured.err[0]).toContain("not-found");
  });
});

describe("builds beta-detail set (resolves the detail id before PATCH)", () => {
  it("reads the buildBetaDetail then PATCHes only autoNotifyEnabled", async () => {
    ascGet("/v1/builds/b1/buildBetaDetail", {
      data: {
        type: "buildBetaDetails",
        id: "d1",
        attributes: { autoNotifyEnabled: false },
      },
      links: { self: `${ASC_API_BASE_URL}/v1/builds/b1/buildBetaDetail` },
    });
    const bodyOf = captureWrite("PATCH", "/v1/buildBetaDetails/d1", 200, {
      data: {
        type: "buildBetaDetails",
        id: "d1",
        attributes: { autoNotifyEnabled: true },
      },
      links: { self: `${ASC_API_BASE_URL}/v1/buildBetaDetails/d1` },
    });

    const captured = makeIo();
    const exit = await runCli(
      ["builds", "beta-detail", "set", "b1", "--auto-notify", "true"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    expect(JSON.parse(bodyOf() ?? "{}")).toEqual({
      data: {
        type: "buildBetaDetails",
        id: "d1",
        attributes: { autoNotifyEnabled: true },
      },
    });
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      resolved: { buildId: string; detailId: string };
    };
    expect(envelope.resolved).toEqual({ buildId: "b1", detailId: "d1" });
  });
});

/** Replies to GET /v1/betaGroups/{id} with the given hasAccessToAllBuilds. */
function betaGroupReply(id: string, hasAccessToAllBuilds: boolean): void {
  getAgent()
    .get(ASC_API_BASE_URL)
    .intercept({
      path: (p) => p.startsWith(`/v1/betaGroups/${id}`),
      method: "GET",
    })
    .reply(
      200,
      {
        data: {
          type: "betaGroups",
          id,
          attributes: { hasAccessToAllBuilds },
        },
        links: { self: `${ASC_API_BASE_URL}/v1/betaGroups/${id}` },
      },
      { headers: JSON_HEADERS },
    );
}

describe("builds groups add (relationship linkage, --force)", () => {
  it("pre-checks each group then POSTs the betaGroups linkage array", async () => {
    // The pre-check reads each target group's hasAccessToAllBuilds first.
    betaGroupReply("g1", false);
    betaGroupReply("g2", false);
    const bodyOf = captureWrite(
      "POST",
      "/v1/builds/b1/relationships/betaGroups",
      204,
      "",
    );

    const captured = makeIo();
    const exit = await runCli(
      ["builds", "groups", "add", "b1", "--group", "g1,g2", "--force"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    expect(JSON.parse(bodyOf() ?? "{}")).toEqual({
      data: [
        { type: "betaGroups", id: "g1" },
        { type: "betaGroups", id: "g2" },
      ],
    });
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      command: string;
      data: { added: string[]; count: number };
    };
    expect(envelope.command).toBe("builds groups add");
    expect(envelope.data.added).toEqual(["g1", "g2"]);
    expect(envelope.data.count).toBe(2);
  });

  it("rejects a hasAccessToAllBuilds group with exit 64 and never POSTs the linkage", async () => {
    // g1 already sees every build, so the explicit linkage is redundant.
    betaGroupReply("g1", true);
    // Deliberately register NO relationships POST interceptor: if the pre-check
    // failed to short-circuit, the POST would either 501 (unmocked) or trip the
    // disabled net-connect — never a clean exit 64.

    const captured = makeIo();
    const exit = await runCli(
      ["builds", "groups", "add", "b1", "--group", "g1", "--force"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.out).toEqual([]);
    expect(captured.err[0]).toContain("hasAccessToAllBuilds");
    expect(captured.err[0]).toContain("g1");
  });
});

describe("builds notes set (upsert)", () => {
  it("creates the locale note when absent and reports created:true", async () => {
    ascGet("/v1/betaBuildLocalizations", {
      data: [],
      links: { self: `${ASC_API_BASE_URL}/v1/betaBuildLocalizations` },
    });
    captureWrite("POST", "/v1/betaBuildLocalizations", 201, {
      data: { type: "betaBuildLocalizations", id: "l-new" },
      links: { self: `${ASC_API_BASE_URL}/v1/betaBuildLocalizations/l-new` },
    });

    const captured = makeIo();
    const exit = await runCli(
      [
        "builds",
        "notes",
        "set",
        "b1",
        "--locale",
        "en-US",
        "--whats-new",
        "Try this",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      command: string;
      resolved: { created: boolean; locale: string };
    };
    expect(envelope.command).toBe("builds notes set");
    expect(envelope.resolved.created).toBe(true);
    expect(envelope.resolved.locale).toBe("en-US");
  });
});
