import type {
  DeviceFamily,
  DeviceFamilyOsVersionFilter,
} from "../capabilities/beta-groups.js";
import { CliUsageError } from "./exit-codes.js";
import { csvList } from "./read-scope.js";

/**
 * The device families Apple's recruitment-criteria matrix accepts. Validated
 * locally (unlike ASC-validated enums) because the criteria `--filter` is
 * parsed into a structured object BEFORE any request — a typo must fail as a
 * clear usage error, not as a confusing relationship rejection. `satisfies`
 * keeps the list from drifting past the contract enum; Apple stays
 * authoritative, so a brand-new family missing here means regenerate the
 * contract. soft-check only: it never narrows beyond Apple's own set.
 */
const DEVICE_FAMILIES = [
  "IPHONE",
  "IPAD",
  "APPLE_TV",
  "APPLE_WATCH",
  "MAC",
  "VISION",
] as const satisfies readonly DeviceFamily[];

/**
 * Parses one `--filter deviceFamily:minOs:maxOs` value into a structured
 * DeviceFamilyOsVersionFilter. The OS bounds are optional (empty segments map
 * to "no bound"), but the deviceFamily segment is required and soft-checked
 * against the known families so a typo is caught before any request is sent.
 *
 * Forms accepted (colon-separated, exactly the documented grammar):
 *   IPHONE              → family only
 *   IPHONE:15.0         → family + minimum OS
 *   IPHONE:15.0:17.0    → family + min + max
 *   IPHONE::17.0        → family + max only (empty min segment)
 */
export function parseRecruitmentFilter(
  raw: string,
): DeviceFamilyOsVersionFilter {
  const segments = raw.split(":");
  if (segments.length > 3) {
    throw new CliUsageError(
      `--filter "${raw}" has too many parts; the format is deviceFamily:minOs:maxOs (OS bounds optional).`,
    );
  }
  const familyRaw = (segments[0] ?? "").trim();
  if (familyRaw === "") {
    throw new CliUsageError(
      `--filter "${raw}" is missing the device family; the format is deviceFamily:minOs:maxOs.`,
    );
  }
  if (!(DEVICE_FAMILIES as readonly string[]).includes(familyRaw)) {
    throw new CliUsageError(
      `--filter device family "${familyRaw}" is not known. Apple's API is authoritative; the values this build knows are: ${DEVICE_FAMILIES.join(", ")}. Run 'asc testflight groups criteria options' for the legal matrix.`,
    );
  }
  const min = (segments[1] ?? "").trim();
  const max = (segments[2] ?? "").trim();
  return {
    deviceFamily: familyRaw as DeviceFamily,
    ...(min !== "" && { minimumOsInclusive: min }),
    ...(max !== "" && { maximumOsInclusive: max }),
  };
}

/** Parses every `--filter` value (citty collects repeated string flags as an array). */
export function parseRecruitmentFilters(
  raw: string | string[] | undefined,
): readonly DeviceFamilyOsVersionFilter[] {
  if (raw === undefined) {
    throw new CliUsageError(
      "criteria set requires at least one --filter deviceFamily:minOs:maxOs.",
    );
  }
  const values = Array.isArray(raw) ? raw : [raw];
  const filters = values
    .flatMap((value) => csvList(value) ?? [])
    .map((value) => parseRecruitmentFilter(value));
  if (filters.length === 0) {
    throw new CliUsageError(
      "criteria set requires at least one --filter deviceFamily:minOs:maxOs.",
    );
  }
  return filters;
}

/**
 * The create-only beta-group attributes. They live on the create request but
 * NOT on the update request (Apple fixes a group's internal/external nature and
 * all-builds access at creation). A naive update would silently drop them, so
 * the update verb rejects them explicitly with a pointer to that invariant.
 */
const CREATE_ONLY_GROUP_FLAGS = ["internal", "all-builds"] as const;

/**
 * Guards an `update` verb against the create-only flags. Raised locally (exit
 * 64) before any request, because the contract's update request omits these
 * fields — passing them is always a usage error, never an ASC round trip.
 */
export function rejectCreateOnlyGroupFlags(
  args: Readonly<Record<string, unknown>>,
): void {
  const offenders = CREATE_ONLY_GROUP_FLAGS.filter(
    (flag) => args[flag] !== undefined && args[flag] !== false,
  );
  if (offenders.length > 0) {
    throw new CliUsageError(
      `--${offenders.join(", --")} can only be set when creating a group (a group's internal/external nature and all-builds access are fixed at creation); they cannot be changed on update.`,
    );
  }
}

/**
 * Parses a `--auto-notify <true|false>` flag into a boolean. Modeled as a
 * string (not a bare boolean) so the verb distinguishes "set it false" from
 * "flag absent" and the caller is forced to state the value explicitly.
 */
export function parseAutoNotify(raw: string | undefined): boolean {
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  throw new CliUsageError(
    `--auto-notify expects true or false, got "${raw ?? "(missing)"}".`,
  );
}
