import { beforeAll, describe, expect, it } from "vitest";

import { runCli } from "../src/cli/main.js";
import { ASC_API_BASE_URL } from "../src/http/client.js";
import { ascItem, JSON_HEADERS } from "./helpers/asc-fixtures.js";
import { useMockAgent } from "./helpers/mock-agent.js";
import { makeTestKey, TEST_KEY_ID } from "./helpers/test-credentials.js";

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

const PROBE_PATH = "/v1/apps?limit=1";

describe("auth check", () => {
  it("confirms authentication with a single harmless read", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: PROBE_PATH, method: "GET" })
      .reply(
        200,
        {
          data: [{ type: "apps", id: "1" }],
          links: { self: `${ASC_API_BASE_URL}/v1/apps` },
          meta: { paging: { limit: 1, total: 7 } },
        },
        { headers: JSON_HEADERS },
      );

    const captured = makeIo();
    const code = await runCli(["auth", "check"], captured.io, env);

    expect(code).toBe(0);
    expect(captured.out).toHaveLength(1);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      command: string;
      data: {
        authenticated: boolean;
        keyForm: string;
        keyId: string;
        appsVisible: number;
      };
    };
    expect(envelope.command).toBe("auth check");
    expect(envelope.data.authenticated).toBe(true);
    expect(envelope.data.keyForm).toBe("team");
    expect(envelope.data.keyId).toBe(`...${TEST_KEY_ID.slice(-4)}`);
    expect(envelope.data.appsVisible).toBe(7);
  });

  it("maps a 401 to exit 3 with a clock-skew hint", async () => {
    // A 401 triggers one controlled re-sign + replay, so the probe is hit
    // twice before the middleware gives up.
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: PROBE_PATH, method: "GET" })
      .reply(
        401,
        { errors: [ascItem({ code: "NOT_AUTHORIZED", status: "401" })] },
        { headers: JSON_HEADERS },
      )
      .times(2);

    const captured = makeIo();
    const code = await runCli(["auth", "check"], captured.io, env);

    expect(code).toBe(3);
    expect(captured.out).toHaveLength(0);
    expect(captured.err[0]).toContain("error[authentication]:");
    expect(captured.err.join("\n").toLowerCase()).toContain("clock");
  });

  it("maps a 403 to exit 3 as a permission error", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: PROBE_PATH, method: "GET" })
      .reply(
        403,
        { errors: [ascItem({ code: "FORBIDDEN_ERROR", status: "403" })] },
        { headers: JSON_HEADERS },
      );

    const captured = makeIo();
    const code = await runCli(["auth", "check"], captured.io, env);

    expect(code).toBe(3);
    expect(captured.out).toHaveLength(0);
    expect(captured.err[0]).toContain("error[permission]:");
  });

  it("fails offline with exit 2 when credentials are missing", async () => {
    const captured = makeIo();
    const code = await runCli(["auth", "check"], captured.io, {});

    expect(code).toBe(2);
    expect(captured.out).toHaveLength(0);
    expect(captured.err[0]).toContain("error[credential]:");
    expect(captured.err.join("\n")).toContain("ASC_KEY_ID");
  });
});
