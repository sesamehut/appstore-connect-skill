import {
  loadAscCredentialsFromEnv,
  ASC_ENV_VARS,
} from "../auth/credentials.js";
import { AscCredentialError } from "../errors.js";

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
}

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
    return {
      name: "credentials",
      status: "pass",
      detail: `Loaded a ${credentials.keyForm} key (key id ending ...${credentials.keyId.slice(-4)})`,
    };
  } catch (error) {
    if (error instanceof AscCredentialError) {
      return {
        name: "credentials",
        status: "fail",
        detail: error.message,
        fix: credentialFix(error),
      };
    }
    throw error;
  }
}

function credentialFix(error: AscCredentialError): string {
  switch (error.reason) {
    case "missing-key-id":
      return `Set ${ASC_ENV_VARS.keyId}. Keys live in App Store Connect → Users and Access → Integrations.`;
    case "missing-private-key":
      return `Set ${ASC_ENV_VARS.privateKey} (inline PEM) or ${ASC_ENV_VARS.privateKeyPath} (path to the .p8 file).`;
    case "conflicting-private-key-sources":
      return `Unset one of ${ASC_ENV_VARS.privateKey} / ${ASC_ENV_VARS.privateKeyPath}.`;
    case "unreadable-private-key-file":
      return `Fix the path in ${ASC_ENV_VARS.privateKeyPath} so the .p8 file is readable.`;
    case "invalid-private-key":
      return "Use the unmodified .p8 file content downloaded from App Store Connect.";
  }
}
