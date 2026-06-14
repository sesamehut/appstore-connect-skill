import { beforeAll, describe, expect, it } from "vitest";

import { runCli } from "../src/cli/main.js";
import { EXIT, mapAscErrorToExit } from "../src/cli/exit-codes.js";
import type { AscErrorCategory } from "../src/errors.js";
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

describe("submission argument validation (exit 64, no network)", () => {
  it("requires --force to submit a version for review", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["submission", "submit", "--version", "v1"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.out).toEqual([]);
    expect(captured.err[0]).toContain("--force");
  });

  it("requires --force to cancel a review submission", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["submission", "cancel", "sub-1"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("--force");
  });

  it("requires --force to release a version", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["submission", "release", "--version", "v1"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("--force");
  });

  it("rejects an empty release-config set (no fields)", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["submission", "release-config", "set", "--version", "v1"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("at least one field");
  });

  it("rejects a bad --release-type enum", async () => {
    const captured = makeIo();
    const exit = await runCli(
      [
        "submission",
        "release-config",
        "set",
        "--version",
        "v1",
        "--release-type",
        "NOPE",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("--release-type");
  });

  it("rejects a malformed --earliest-release-date", async () => {
    const captured = makeIo();
    const exit = await runCli(
      [
        "submission",
        "release-config",
        "set",
        "--version",
        "v1",
        "--earliest-release-date",
        "not-a-date",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("--earliest-release-date");
  });

  it("rejects a bare date --earliest-release-date (no time/zone) before any network", async () => {
    // Date.parse accepts a bare date, so the regex tightening is what catches
    // this — Apple's earliestReleaseDate needs a full date-time with a zone.
    const captured = makeIo();
    const exit = await runCli(
      [
        "submission",
        "release-config",
        "set",
        "--version",
        "v1",
        "--earliest-release-date",
        "2026-07-01",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.out).toEqual([]);
    expect(captured.err[0]).toContain("--earliest-release-date");
    expect(captured.err[0]).toContain("timezone");
  });

  it("rejects a date-time without a timezone --earliest-release-date", async () => {
    const captured = makeIo();
    const exit = await runCli(
      [
        "submission",
        "release-config",
        "set",
        "--version",
        "v1",
        "--earliest-release-date",
        "2026-07-01T12:00:00",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.out).toEqual([]);
    expect(captured.err[0]).toContain("--earliest-release-date");
  });

  it("rejects a non-true/false --downloadable value", async () => {
    const captured = makeIo();
    const exit = await runCli(
      [
        "submission",
        "release-config",
        "set",
        "--version",
        "v1",
        "--downloadable",
        "maybe",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("--downloadable");
  });

  it("rejects a non-true/false --uses-non-exempt-encryption value", async () => {
    const captured = makeIo();
    const exit = await runCli(
      [
        "submission",
        "export-compliance",
        "set",
        "--build",
        "b1",
        "--uses-non-exempt-encryption",
        "x",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("--uses-non-exempt-encryption");
  });

  it("rejects a review-detail set with no fields", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["submission", "review-detail", "set", "--version", "v1"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("at least one field");
  });

  it("requires --app on status list (filter[app] is non-optional)", async () => {
    const captured = makeIo();
    const exit = await runCli(
      ["submission", "status", "list"],
      captured.io,
      env,
    );

    expect(exit).toBe(64);
    expect(captured.err[0]).toContain("error[usage]:");
  });
});

// ---------------------------------------------------------------------------
// Read-only success envelopes
// ---------------------------------------------------------------------------

describe("submission status list (list envelope, scope, filter[app])", () => {
  it("emits a list envelope at single-page scope by default", async () => {
    ascGet("/v1/reviewSubmissions", {
      data: [
        {
          type: "reviewSubmissions",
          id: "sub-1",
          attributes: { state: "READY_FOR_REVIEW", platform: "IOS" },
        },
      ],
      links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissions` },
    });

    const captured = makeIo();
    const exit = await runCli(
      ["submission", "status", "list", "--app", "app-1"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      command: string;
      data: { id: string }[];
      pagination: { scope: string };
      resolved: { appId: string };
    };
    expect(envelope.command).toBe("submission status list");
    expect(envelope.data.map((s) => s.id)).toEqual(["sub-1"]);
    expect(envelope.pagination.scope).toBe("single-page");
    expect(envelope.resolved.appId).toBe("app-1");
  });
});

describe("submission preflight (read-only blockers[] shape)", () => {
  it("aggregates a structured readiness report with blockers[]", async () => {
    // Version: editable, no attached build → MISSING_BUILD; no phased release.
    ascGet("/v1/appStoreVersions/v1?", {
      data: {
        type: "appStoreVersions",
        id: "v1",
        attributes: {
          versionString: "1.1.2",
          appVersionState: "PREPARE_FOR_SUBMISSION",
        },
        relationships: {},
      },
      links: { self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1` },
    });
    // Review detail: absent (data: null narrowed to undefined).
    ascGet("/v1/appStoreVersions/v1/appStoreReviewDetail", {
      data: null,
      links: {
        self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1/appStoreReviewDetail`,
      },
    });
    // Age rating: absent → MISSING_AGE_RATING.
    ascGet("/v1/apps/app-1/appInfos", {
      data: [{ type: "appInfos", id: "ai-1" }],
      included: [],
      links: { self: `${ASC_API_BASE_URL}/v1/apps/app-1/appInfos` },
    });
    // Localizations: none → MISSING_LOCALIZATION.
    ascGet("/v1/appStoreVersions/v1/appStoreVersionLocalizations", {
      data: [],
      links: {
        self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1/appStoreVersionLocalizations`,
      },
    });
    // Phased release: none configured.
    ascGet("/v1/appStoreVersions/v1/appStoreVersionPhasedRelease", {
      data: null,
      links: {
        self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1/appStoreVersionPhasedRelease`,
      },
    });

    const captured = makeIo();
    const exit = await runCli(
      ["submission", "preflight", "--version", "v1", "--app", "app-1"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      command: string;
      data: { submittable: boolean; blockers: string[]; snapshot: object };
      resolved: { appId: string; versionId: string };
    };
    expect(envelope.command).toBe("submission preflight");
    expect(envelope.data.submittable).toBe(false);
    expect(envelope.data.blockers).toContain("MISSING_BUILD");
    expect(envelope.data.blockers).toContain("MISSING_REVIEW_DETAIL");
    expect(envelope.data.blockers).toContain("MISSING_AGE_RATING");
    expect(envelope.data.blockers).toContain("MISSING_LOCALIZATION");
    expect(envelope.resolved).toEqual({ appId: "app-1", versionId: "v1" });
  });
});

// ---------------------------------------------------------------------------
// Find-or-create + low side-effect writes
// ---------------------------------------------------------------------------

// The literal demo-account password the mocked ASC returns; the redactor must
// keep this exact substring out of every emitted envelope. Sharing one constant
// makes the leak assertions trivially auditable.
const DEMO_PW = "hunter2-demo-pw";

describe("submission review-detail get (demo-account password redacted)", () => {
  it("emits the detail without the password and with demoAccountPasswordSet", async () => {
    ascGet("/v1/appStoreVersions/v1/appStoreReviewDetail", {
      data: {
        type: "appStoreReviewDetails",
        id: "rd-1",
        attributes: {
          contactEmail: "dev@x.com",
          demoAccountName: "reviewer",
          demoAccountPassword: DEMO_PW,
          demoAccountRequired: true,
          notes: "see demo",
        },
      },
      links: {
        self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1/appStoreReviewDetail`,
      },
    });

    const captured = makeIo();
    const exit = await runCli(
      ["submission", "review-detail", "get", "--version", "v1"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const raw = captured.out[0] ?? "";
    // The whole stdout envelope must never carry the password substring.
    expect(raw).not.toContain(DEMO_PW);
    const envelope = JSON.parse(raw) as {
      data: {
        attributes: {
          demoAccountName: string;
          demoAccountRequired: boolean;
          notes: string;
          demoAccountPasswordSet: boolean;
          demoAccountPassword?: string;
        };
      };
    };
    expect(envelope.data.attributes.demoAccountPasswordSet).toBe(true);
    expect(envelope.data.attributes.demoAccountPassword).toBeUndefined();
    // Every non-secret field stays visible.
    expect(envelope.data.attributes.demoAccountName).toBe("reviewer");
    expect(envelope.data.attributes.demoAccountRequired).toBe(true);
    expect(envelope.data.attributes.notes).toBe("see demo");
  });
});

describe("submission review-detail set (find-or-create by version)", () => {
  it("PATCHes the existing detail by its id when one is present", async () => {
    ascGet("/v1/appStoreVersions/v1/appStoreReviewDetail", {
      data: {
        type: "appStoreReviewDetails",
        id: "rd-1",
        attributes: { contactEmail: "old@x.com" },
      },
      links: {
        self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1/appStoreReviewDetail`,
      },
    });
    const bodyOf = captureWrite(
      "PATCH",
      "/v1/appStoreReviewDetails/rd-1",
      200,
      {
        data: {
          type: "appStoreReviewDetails",
          id: "rd-1",
          // The write-response echoes the password back; the set path must
          // redact it just like the get path.
          attributes: {
            contactEmail: "new@x.com",
            demoAccountPassword: DEMO_PW,
          },
        },
        links: { self: `${ASC_API_BASE_URL}/v1/appStoreReviewDetails/rd-1` },
      },
    );

    const captured = makeIo();
    const exit = await runCli(
      [
        "submission",
        "review-detail",
        "set",
        "--version",
        "v1",
        "--contact-email",
        "new@x.com",
        "--demo-account-password",
        DEMO_PW,
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: { id: string; attributes: { contactEmail: string } };
    };
    expect(body.data.id).toBe("rd-1");
    expect(body.data.attributes.contactEmail).toBe("new@x.com");
    const raw = captured.out[0] ?? "";
    expect(raw).not.toContain(DEMO_PW);
    const envelope = JSON.parse(raw) as {
      command: string;
      data: { attributes: { demoAccountPasswordSet: boolean } };
      resolved: { versionId: string; detailId: string; created: boolean };
    };
    expect(envelope.command).toBe("submission review-detail set");
    expect(envelope.data.attributes.demoAccountPasswordSet).toBe(true);
    expect(envelope.resolved).toEqual({
      versionId: "v1",
      detailId: "rd-1",
      created: false,
    });
  });

  it("POSTs a new detail carrying the version relationship when none exists", async () => {
    ascGet("/v1/appStoreVersions/v1/appStoreReviewDetail", {
      data: null,
      links: {
        self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1/appStoreReviewDetail`,
      },
    });
    const bodyOf = captureWrite("POST", "/v1/appStoreReviewDetails", 201, {
      data: {
        type: "appStoreReviewDetails",
        id: "rd-new",
        attributes: { notes: "see demo", demoAccountPassword: DEMO_PW },
      },
      links: { self: `${ASC_API_BASE_URL}/v1/appStoreReviewDetails/rd-new` },
    });

    const captured = makeIo();
    const exit = await runCli(
      [
        "submission",
        "review-detail",
        "set",
        "--version",
        "v1",
        "--notes",
        "see demo",
        "--demo-account-password",
        DEMO_PW,
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: {
        relationships: { appStoreVersion: { data: { id: string } } };
      };
    };
    expect(body.data.relationships.appStoreVersion.data.id).toBe("v1");
    const raw = captured.out[0] ?? "";
    expect(raw).not.toContain(DEMO_PW);
    const envelope = JSON.parse(raw) as {
      data: { attributes: { demoAccountPasswordSet: boolean } };
      resolved: { detailId: string; created: boolean };
    };
    expect(envelope.data.attributes.demoAccountPasswordSet).toBe(true);
    expect(envelope.resolved.created).toBe(true);
    expect(envelope.resolved.detailId).toBe("rd-new");
  });
});

describe("submission release-config set (version PATCH, parsed fields)", () => {
  it("PATCHes releaseType + build relationship after local validation", async () => {
    const bodyOf = captureWrite("PATCH", "/v1/appStoreVersions/v1", 200, {
      data: {
        type: "appStoreVersions",
        id: "v1",
        attributes: { releaseType: "SCHEDULED" },
      },
      links: { self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1` },
    });

    const captured = makeIo();
    const exit = await runCli(
      [
        "submission",
        "release-config",
        "set",
        "--version",
        "v1",
        "--release-type",
        "SCHEDULED",
        "--earliest-release-date",
        "2026-09-01T10:00:00Z",
        "--downloadable",
        "true",
        "--build",
        "b9",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: {
        attributes: {
          releaseType: string;
          earliestReleaseDate: string;
          downloadable: boolean;
        };
        relationships: { build: { data: { type: string; id: string } } };
      };
    };
    expect(body.data.attributes.releaseType).toBe("SCHEDULED");
    expect(body.data.attributes.earliestReleaseDate).toBe(
      "2026-09-01T10:00:00Z",
    );
    expect(body.data.attributes.downloadable).toBe(true);
    expect(body.data.relationships.build.data).toEqual({
      type: "builds",
      id: "b9",
    });
  });

  it("accepts a full numeric-offset --earliest-release-date and PATCHes it through", async () => {
    const bodyOf = captureWrite("PATCH", "/v1/appStoreVersions/v1", 200, {
      data: {
        type: "appStoreVersions",
        id: "v1",
        attributes: { releaseType: "SCHEDULED" },
      },
      links: { self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1` },
    });

    const captured = makeIo();
    const exit = await runCli(
      [
        "submission",
        "release-config",
        "set",
        "--version",
        "v1",
        "--earliest-release-date",
        "2026-07-01T12:00:00-07:00",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: { attributes: { earliestReleaseDate: string } };
    };
    expect(body.data.attributes.earliestReleaseDate).toBe(
      "2026-07-01T12:00:00-07:00",
    );
  });
});

describe("submission export-compliance set (build boolean PATCH)", () => {
  it("PATCHes usesNonExemptEncryption on the build", async () => {
    const bodyOf = captureWrite("PATCH", "/v1/builds/b1", 200, {
      data: {
        type: "builds",
        id: "b1",
        attributes: { usesNonExemptEncryption: false },
      },
      links: { self: `${ASC_API_BASE_URL}/v1/builds/b1` },
    });

    const captured = makeIo();
    const exit = await runCli(
      [
        "submission",
        "export-compliance",
        "set",
        "--build",
        "b1",
        "--uses-non-exempt-encryption",
        "false",
      ],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: { attributes: { usesNonExemptEncryption: boolean } };
    };
    expect(body.data.attributes.usesNonExemptEncryption).toBe(false);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      resolved: { buildId: string; usesNonExemptEncryption: boolean };
    };
    expect(envelope.resolved).toEqual({
      buildId: "b1",
      usesNonExemptEncryption: false,
    });
  });
});

// ---------------------------------------------------------------------------
// High side-effect writes: async-accept envelopes (with --force).
// ---------------------------------------------------------------------------

describe("submission submit (--force, async-accept envelope)", () => {
  it("opens a container, attaches the version item, and PATCHes submitted=true", async () => {
    // No existing unsubmitted container holding v1.
    ascGet("/v1/reviewSubmissions", {
      data: [],
      links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissions` },
    });
    const containerBody = captureWrite("POST", "/v1/reviewSubmissions", 201, {
      data: {
        type: "reviewSubmissions",
        id: "sub-new",
        attributes: { state: "READY_FOR_REVIEW", platform: "IOS" },
      },
      links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissions/sub-new` },
    });
    const itemBody = captureWrite("POST", "/v1/reviewSubmissionItems", 201, {
      data: { type: "reviewSubmissionItems", id: "item-new" },
      links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissionItems/item-new` },
    });
    const submitBody = captureWrite(
      "PATCH",
      "/v1/reviewSubmissions/sub-new",
      200,
      {
        data: {
          type: "reviewSubmissions",
          id: "sub-new",
          attributes: { state: "WAITING_FOR_REVIEW" },
        },
        links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissions/sub-new` },
      },
    );

    const captured = makeIo();
    const exit = await runCli(
      ["submission", "submit", "--version", "v1", "--app", "app-1", "--force"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    // The item carries exactly one content relationship (appStoreVersion).
    const item = JSON.parse(itemBody() ?? "{}") as {
      data: {
        relationships: {
          reviewSubmission: { data: { id: string } };
          appStoreVersion: { data: { id: string } };
        };
      };
    };
    expect(item.data.relationships.reviewSubmission.data.id).toBe("sub-new");
    expect(item.data.relationships.appStoreVersion.data.id).toBe("v1");
    // The submit PATCH drives submitted=true (not state).
    const submit = JSON.parse(submitBody() ?? "{}") as {
      data: { attributes: { submitted: boolean } };
    };
    expect(submit.data.attributes.submitted).toBe(true);
    // The container POST names the app relationship.
    const container = JSON.parse(containerBody() ?? "{}") as {
      data: { relationships: { app: { data: { id: string } } } };
    };
    expect(container.data.relationships.app.data.id).toBe("app-1");

    const envelope = JSON.parse(captured.out[0] ?? "") as {
      command: string;
      data: {
        submissionId: string;
        itemId: string;
        appId: string;
        versionId: string;
        submitted: boolean;
        accepted: boolean;
      };
    };
    expect(envelope.command).toBe("submission submit");
    expect(envelope.data).toMatchObject({
      submissionId: "sub-new",
      itemId: "item-new",
      appId: "app-1",
      versionId: "v1",
      submitted: true,
      accepted: true,
    });
  });
});

describe("submission cancel (--force, async-accept envelope)", () => {
  it("PATCHes canceled=true and reports acceptance", async () => {
    const bodyOf = captureWrite("PATCH", "/v1/reviewSubmissions/sub-1", 200, {
      data: {
        type: "reviewSubmissions",
        id: "sub-1",
        attributes: { state: "CANCELING" },
      },
      links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissions/sub-1` },
    });

    const captured = makeIo();
    const exit = await runCli(
      ["submission", "cancel", "sub-1", "--force"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: { attributes: { canceled: boolean } };
    };
    expect(body.data.attributes.canceled).toBe(true);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      command: string;
      data: { submissionId: string; canceled: boolean; accepted: boolean };
    };
    expect(envelope.command).toBe("submission cancel");
    expect(envelope.data).toEqual({
      submissionId: "sub-1",
      canceled: true,
      accepted: true,
    });
  });
});

describe("submission release (--force, async-accept envelope)", () => {
  it("POSTs an appStoreVersionReleaseRequest naming the version", async () => {
    const bodyOf = captureWrite(
      "POST",
      "/v1/appStoreVersionReleaseRequests",
      201,
      {
        data: { type: "appStoreVersionReleaseRequests", id: "rel-1" },
        links: {
          self: `${ASC_API_BASE_URL}/v1/appStoreVersionReleaseRequests/rel-1`,
        },
      },
    );

    const captured = makeIo();
    const exit = await runCli(
      ["submission", "release", "--version", "v1", "--force"],
      captured.io,
      env,
    );

    expect(exit).toBe(0);
    const body = JSON.parse(bodyOf() ?? "{}") as {
      data: { relationships: { appStoreVersion: { data: { id: string } } } };
    };
    expect(body.data.relationships.appStoreVersion.data.id).toBe("v1");
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      command: string;
      data: { versionId: string; releaseRequestId: string; accepted: boolean };
    };
    expect(envelope.command).toBe("submission release");
    expect(envelope.data).toEqual({
      versionId: "v1",
      releaseRequestId: "rel-1",
      accepted: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Legacy submission model: Apple-unsupported (exit 6 boundary).
// ---------------------------------------------------------------------------

describe("legacy appStoreVersionSubmissions boundary (exit 6 via capabilities)", () => {
  it("lists the legacy submit model, post-submit edits, and un-cancel as unsupported", async () => {
    const captured = makeIo();
    const exit = await runCli(["capabilities"], captured.io, {});

    expect(exit).toBe(0);
    const envelope = JSON.parse(captured.out[0] ?? "") as {
      data: { unsupportedByAppleApi: { task: string }[] };
    };
    const tasks = envelope.data.unsupportedByAppleApi.map((t) =>
      t.task.toLowerCase(),
    );
    expect(tasks.some((t) => t.includes("appstoreversionsubmissions"))).toBe(
      true,
    );
    expect(tasks.some((t) => t.includes("after it has been submitted"))).toBe(
      true,
    );
    expect(tasks.some((t) => t.includes("un-canceling"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Exit-code mapping: STATE_ERROR -> 3, and zero expansion of the map.
// ---------------------------------------------------------------------------

describe("submit STATE_ERROR normalization (exit 3 via the request path)", () => {
  it("a 409 STATE_ERROR on the submit PATCH maps to exit 3, not 5 or 6", async () => {
    // The version is not actually submittable; ASC returns STATE_ERROR on the
    // submit PATCH. preflight is advisory — the real hard gate is this server
    // rejection, normalized through the existing invalid-parameter -> exit 3
    // path. It must NOT be confused with not-implemented (5) or unsupported (6).
    ascGet("/v1/reviewSubmissions", {
      data: [],
      links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissions` },
    });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/reviewSubmissions", method: "POST" })
      .reply(
        201,
        {
          data: {
            type: "reviewSubmissions",
            id: "sub-new",
            attributes: { state: "READY_FOR_REVIEW" },
          },
          links: { self: `${ASC_API_BASE_URL}/v1/reviewSubmissions/sub-new` },
        },
        { headers: JSON_HEADERS },
      );
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/reviewSubmissionItems", method: "POST" })
      .reply(
        201,
        {
          data: { type: "reviewSubmissionItems", id: "item-new" },
          links: {
            self: `${ASC_API_BASE_URL}/v1/reviewSubmissionItems/item-new`,
          },
        },
        { headers: JSON_HEADERS },
      );
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/reviewSubmissions/sub-new", method: "PATCH" })
      .reply(
        409,
        {
          errors: [
            {
              code: "STATE_ERROR",
              status: "409",
              title: "The request cannot be fulfilled because of the state",
              detail: "The version is not ready for submission.",
            },
          ],
        },
        { headers: JSON_HEADERS },
      );

    const captured = makeIo();
    const exit = await runCli(
      ["submission", "submit", "--version", "v1", "--app", "app-1", "--force"],
      captured.io,
      env,
    );

    expect(exit).toBe(EXIT.ascRequest);
    expect(exit).toBe(3);
    expect(captured.out).toEqual([]);
    expect(
      captured.err.some((line) => line.includes("invalid-parameter")),
    ).toBe(true);
  });
});

describe("mapAscErrorToExit has zero expansion (reused families only)", () => {
  it("maps each existing category to its established exit code", () => {
    const expected: Record<AscErrorCategory, number> = {
      credential: EXIT.configuration,
      authentication: EXIT.ascRequest,
      permission: EXIT.ascRequest,
      "not-found": EXIT.ascRequest,
      "invalid-parameter": EXIT.ascRequest,
      "rate-limit": EXIT.rateLimit,
      upstream: EXIT.ascRequest,
      network: EXIT.ascRequest,
      "file-processing": EXIT.ascRequest,
    };
    for (const [category, code] of Object.entries(expected)) {
      expect(mapAscErrorToExit(category as AscErrorCategory)).toBe(code);
    }
    // No submission-specific category was introduced this phase.
    expect(Object.keys(expected)).toHaveLength(9);
  });
});
