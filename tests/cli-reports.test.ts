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

describe("reports analytics ensure-request", () => {
  it("emits the request document with the resolved.created marker", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) =>
          path.startsWith("/v1/apps/app-1/analyticsReportRequests"),
        method: "GET",
      })
      .reply(
        200,
        {
          data: [],
          links: {
            self: `${ASC_API_BASE_URL}/v1/apps/app-1/analyticsReportRequests`,
          },
        },
        { headers: JSON_HEADERS },
      );
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/analyticsReportRequests", method: "POST" })
      .reply(
        201,
        {
          data: {
            type: "analyticsReportRequests",
            id: "req-new",
            attributes: {
              accessType: "ONGOING",
              stoppedDueToInactivity: false,
            },
          },
          links: {
            self: `${ASC_API_BASE_URL}/v1/analyticsReportRequests/req-new`,
          },
        },
        { headers: JSON_HEADERS },
      );

    const captured = makeIo();
    const exit = await runCli(
      ["reports", "analytics", "ensure-request", "--app", "app-1"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      command: string;
      data: { id: string };
      resolved: { created: boolean };
    };
    expect(envelope.command).toBe("reports analytics ensure-request");
    expect(envelope.data.id).toBe("req-new");
    expect(envelope.resolved.created).toBe(true);
  });

  it("rejects an unknown access type as a usage error", async () => {
    const captured = makeIo();
    const exit = await runCli(
      [
        "reports",
        "analytics",
        "ensure-request",
        "--app",
        "app-1",
        "--access-type",
        "SOMETIMES",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.out).toEqual([]);
    expect(captured.err[0]).toContain("ONE_TIME_SNAPSHOT");
  });
});

describe("reports analytics delete-request", () => {
  it("deletes by id and reports the deletion", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: "/v1/analyticsReportRequests/req-old",
        method: "DELETE",
      })
      .reply(204);

    const captured = makeIo();
    const exit = await runCli(
      ["reports", "analytics", "delete-request", "req-old"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      data: { id: string; deleted: boolean };
    };
    expect(envelope.data).toEqual({ id: "req-old", deleted: true });
  });
});

describe("reports sub-domains still landing in M5", () => {
  it("answers 'reports sales' with the planned-milestone stub", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["reports", "sales", "download", "--whatever"],
      captured.io,
      env,
    );

    expect(exit).toBe(5);
    expect(captured.out).toEqual([]);
    expect(captured.err[0]).toContain("M5");
  });
});
