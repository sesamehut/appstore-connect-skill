import type { AnalyticsReportAccessType } from "../capabilities/analytics-reports.js";
import { CliUsageError } from "./exit-codes.js";

const ACCESS_TYPES = [
  "ONGOING",
  "ONE_TIME_SNAPSHOT",
] as const satisfies readonly AnalyticsReportAccessType[];

/**
 * Validated locally (unlike most enum flags, which ASC validates) because
 * the ensure workflow branches on the value before any request is sent — a
 * typo must fail as a usage error, not as a confusing ASC filter rejection.
 */
export function resolveAccessType(
  raw: string | undefined,
): AnalyticsReportAccessType {
  if (raw === undefined) {
    return "ONGOING";
  }
  if ((ACCESS_TYPES as readonly string[]).includes(raw)) {
    return raw as AnalyticsReportAccessType;
  }
  throw new CliUsageError(
    `--access-type expects ONGOING or ONE_TIME_SNAPSHOT, got "${raw}".`,
  );
}
