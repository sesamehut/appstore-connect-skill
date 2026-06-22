import {
  loadAscCredentialsFromEnv,
  ASC_ENV_VARS,
} from "../auth/credentials.js";
import {
  inspectCredentialFormat,
  inspectInlinePrivateKey,
} from "../auth/credential-format.js";
import { AscCredentialError } from "../errors.js";
import { ASC_VENDOR_NUMBER_ENV } from "./report-flags.js";

/**
 * Kept as a constant (not read from package.json at runtime) so the M8
 * single-file bundle needs no filesystem access; a unit test pins it to
 * `engines.node`.
 */
export const MIN_NODE_VERSION = "22.12.0";

/** Compares dotted numeric versions; negative when a < b. */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const partsB = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(partsA.length, partsB.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (partsA[index] ?? 0) - (partsB[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

export interface DoctorCheck {
  readonly name: string;
  readonly status: "pass" | "fail";
  readonly detail: string;
  readonly fix?: string;
  /**
   * Non-fatal advisories: a passing check can still flag a likely mistake
   * (e.g. a Key ID / Issuer ID that loaded but looks swapped). Warnings never
   * change `status`, so the offline exit-code contract is unaffected.
   */
  readonly warnings?: readonly string[];
}

/**
 * Build-time flag esbuild replaces with the literal `true` (via `define`) when
 * producing the single-file `asc.mjs`. In a normal tsc dev build it is never
 * defined, so `isBundled()` reads it through a typeof guard and falls back to
 * false — dev behavior is unchanged. The flag exists because the bundle has no
 * node_modules and no sibling `index.js`, so the dependency and build checks
 * below cannot probe the filesystem and must instead self-report as a bundle.
 */
declare const __ASC_BUNDLED__: boolean;

function isBundled(): boolean {
  // typeof guard keeps this a ReferenceError-safe read in the dev build, where
  // the identifier is never defined; esbuild folds it to `true` in the bundle.
  return typeof __ASC_BUNDLED__ !== "undefined" && __ASC_BUNDLED__;
}

const BUNDLED_DETAIL = "running from single-file bundle";

export function checkNodeVersion(currentVersion: string): DoctorCheck {
  const satisfied = compareVersions(currentVersion, MIN_NODE_VERSION) >= 0;
  return {
    name: "node-version",
    status: satisfied ? "pass" : "fail",
    detail: `Node ${currentVersion} (minimum ${MIN_NODE_VERSION})`,
    ...(satisfied
      ? {}
      : {
          fix: `Install Node ${MIN_NODE_VERSION} or newer (24 LTS recommended) and re-run.`,
        }),
  };
}

/** Catches a partial or stale install: both runtime deps must be loadable. */
export async function checkDependencies(): Promise<DoctorCheck> {
  // In the bundle the deps are inlined, so there is nothing to import by
  // specifier; esbuild would also have resolved these static strings at build
  // time, making the probe meaningless. Self-report as pass instead.
  if (isBundled()) {
    return {
      name: "dependencies",
      status: "pass",
      detail: `jose and openapi-fetch are inlined (${BUNDLED_DETAIL})`,
    };
  }
  const missing: string[] = [];
  for (const name of ["jose", "openapi-fetch"]) {
    try {
      await import(name);
    } catch {
      missing.push(name);
    }
  }
  return missing.length === 0
    ? {
        name: "dependencies",
        status: "pass",
        detail: "jose and openapi-fetch are loadable",
      }
    : {
        name: "dependencies",
        status: "fail",
        detail: `Cannot load: ${missing.join(", ")}`,
        fix: "Run `npm ci` in the repository root, then `npm run build`.",
      };
}

/** Validates that the library half of dist/ is importable alongside the CLI. */
export async function checkBuild(): Promise<DoctorCheck> {
  // The bundle has no sibling `../index.js`: the library half is compiled into
  // this same file. If we reached this code the build is, by definition, intact.
  if (isBundled()) {
    return {
      name: "build",
      status: "pass",
      detail: `capability modules are inlined (${BUNDLED_DETAIL})`,
    };
  }
  try {
    await import("../index.js");
    return {
      name: "build",
      status: "pass",
      detail: "Capability modules are importable",
    };
  } catch {
    return {
      name: "build",
      status: "fail",
      detail: "The library build next to the CLI cannot be loaded",
      fix: "Run `npm run build` in the repository root to refresh dist/.",
    };
  }
}

/**
 * Offline credentials check: reports which env vars are missing or
 * conflicting and the inferred key form. Never echoes values; live
 * verification belongs to `npm run smoke`.
 */
export async function checkCredentials(
  env: Readonly<Record<string, string | undefined>>,
): Promise<DoctorCheck> {
  try {
    const credentials = await loadAscCredentialsFromEnv(env);
    const warnings = inspectCredentialFormat(env).map(
      (warning) => warning.message,
    );
    return {
      name: "credentials",
      status: "pass",
      detail: `Loaded a ${credentials.keyForm} key (key id ending ...${credentials.keyId.slice(-4)})`,
      ...(warnings.length > 0 && { warnings }),
    };
  } catch (error) {
    if (error instanceof AscCredentialError) {
      return {
        name: "credentials",
        status: "fail",
        detail: error.message,
        fix: credentialFix(error, env),
      };
    }
    throw error;
  }
}

/**
 * Optional account configuration: reports commands need a vendor number, the
 * rest of the CLI does not, so this check informs without ever failing.
 */
export function checkVendorNumber(
  env: Readonly<Record<string, string | undefined>>,
): DoctorCheck {
  const vendor = env[ASC_VENDOR_NUMBER_ENV];
  return {
    name: "vendor-number",
    status: "pass",
    detail:
      vendor === undefined || vendor === ""
        ? `${ASC_VENDOR_NUMBER_ENV} is not set (optional; sales/finance report downloads need it via this variable or --vendor)`
        : `${ASC_VENDOR_NUMBER_ENV} is set (ending ...${vendor.slice(-4)})`,
  };
}

function credentialFix(
  error: AscCredentialError,
  env: Readonly<Record<string, string | undefined>>,
): string {
  switch (error.reason) {
    case "missing-key-id":
      return `Set ${ASC_ENV_VARS.keyId}. Keys live in App Store Connect → Users and Access → Integrations.`;
    case "missing-private-key":
      return `Set ${ASC_ENV_VARS.privateKey} (inline PEM) or ${ASC_ENV_VARS.privateKeyPath} (path to the .p8 file).`;
    case "conflicting-private-key-sources":
      return `Unset one of ${ASC_ENV_VARS.privateKey} / ${ASC_ENV_VARS.privateKeyPath}.`;
    case "unreadable-private-key-file":
      return `Fix the path in ${ASC_ENV_VARS.privateKeyPath} so the .p8 file is readable.`;
    case "invalid-private-key": {
      // Lead with the specific copy-paste mistake when the raw value betrays
      // one; the generic guidance still follows as the fallback.
      const hint = inspectInlinePrivateKey(env[ASC_ENV_VARS.privateKey]);
      const generic =
        "Use the unmodified .p8 file content downloaded from App Store Connect.";
      return hint === undefined ? generic : `${hint} ${generic}`;
    }
  }
}
