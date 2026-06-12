import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  checkCredentials,
  checkNodeVersion,
  compareVersions,
  MIN_NODE_VERSION,
} from "./preflight.js";
import { CLI_VERSION } from "./root.js";

describe("compareVersions", () => {
  it("orders dotted versions numerically", () => {
    expect(compareVersions("22.12.0", "22.12.0")).toBe(0);
    expect(compareVersions("22.11.9", "22.12.0")).toBeLessThan(0);
    expect(compareVersions("24.1.0", "22.12.0")).toBeGreaterThan(0);
    expect(compareVersions("9.0.0", "22.12.0")).toBeLessThan(0);
    expect(compareVersions("22.12", "22.12.0")).toBe(0);
  });
});

describe("constants stay in sync with package.json", () => {
  it("pins MIN_NODE_VERSION to engines.node and CLI_VERSION to version", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { engines: { node: string }; version: string };
    expect(`>=${MIN_NODE_VERSION}`).toBe(packageJson.engines.node);
    expect(CLI_VERSION).toBe(packageJson.version);
  });
});

describe("checkNodeVersion", () => {
  it("passes at and above the minimum, fails below with a fix", () => {
    expect(checkNodeVersion(MIN_NODE_VERSION).status).toBe("pass");
    expect(checkNodeVersion("24.1.0").status).toBe("pass");
    const failed = checkNodeVersion("20.9.0");
    expect(failed.status).toBe("fail");
    expect(failed.fix).toContain("22.12.0");
  });
});

describe("checkCredentials", () => {
  it("reports the missing variable with a fix, without echoing values", async () => {
    const check = await checkCredentials({});
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("ASC_KEY_ID");
    expect(check.fix).toContain("ASC_KEY_ID");
  });
});
