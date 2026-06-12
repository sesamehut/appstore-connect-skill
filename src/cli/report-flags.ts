import type { AnalyticsReportAccessType } from "../capabilities/analytics-reports.js";
import type { SalesReportFrequency } from "../workflows/sales-reports.js";
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

/**
 * Account configuration, deliberately outside ASC_ENV_VARS/credentials.ts:
 * the vendor number selects which reports to fetch, it does not authenticate
 * anything, so the auth layer stays free of report knowledge.
 */
export const ASC_VENDOR_NUMBER_ENV = "ASC_VENDOR_NUMBER";

export function resolveVendorNumber(
  flag: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
): string {
  const vendor = flag ?? env[ASC_VENDOR_NUMBER_ENV];
  if (vendor !== undefined && vendor !== "") {
    return vendor;
  }
  throw new CliUsageError(
    `A vendor number is required: pass --vendor or set ${ASC_VENDOR_NUMBER_ENV}. Find it in App Store Connect → Payments and Financial Reports (top of the page); the API cannot read it.`,
  );
}

interface ReportDateFormat {
  readonly pattern: RegExp;
  readonly description: string;
}

/**
 * Frequency ↔ date-format table, data-driven so the live verification of
 * Apple's actually-accepted formats (M5 核实项 4: official docs say
 * YYYY-MM-DD across the board, community knowledge says MONTHLY=YYYY-MM and
 * YEARLY=YYYY) lands as a one-line correction here.
 */
export const REPORT_DATE_FORMATS: Record<
  SalesReportFrequency,
  ReportDateFormat
> = {
  DAILY: { pattern: /^\d{4}-\d{2}-\d{2}$/, description: "YYYY-MM-DD" },
  WEEKLY: {
    pattern: /^\d{4}-\d{2}-\d{2}$/,
    description: "YYYY-MM-DD (the week's closing date)",
  },
  MONTHLY: { pattern: /^\d{4}-\d{2}$/, description: "YYYY-MM" },
  YEARLY: { pattern: /^\d{4}$/, description: "YYYY" },
};

const SALES_FREQUENCIES = Object.keys(
  REPORT_DATE_FORMATS,
) as readonly SalesReportFrequency[];

/**
 * Validated locally (most enum flags pass through to ASC) because the date
 * validation table is keyed by frequency — an unknown frequency could not
 * say which date format applies.
 */
export function resolveSalesFrequency(
  raw: string | undefined,
): SalesReportFrequency {
  if (raw === undefined) {
    return "DAILY";
  }
  if ((SALES_FREQUENCIES as readonly string[]).includes(raw)) {
    return raw as SalesReportFrequency;
  }
  throw new CliUsageError(
    `--frequency expects one of ${SALES_FREQUENCIES.join(", ")}, got "${raw}".`,
  );
}

export function validateSalesReportDate(
  frequency: SalesReportFrequency,
  date: string | undefined,
): void {
  if (date === undefined) {
    return;
  }
  const format = REPORT_DATE_FORMATS[frequency];
  if (!format.pattern.test(date)) {
    throw new CliUsageError(
      `--date for a ${frequency} sales report must be ${format.description}, got "${date}".`,
    );
  }
}

export function validateProcessingDate(date: string | undefined): void {
  if (date === undefined) {
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new CliUsageError(
      `--date for an analytics instance must be YYYY-MM-DD (the processing date), got "${date}".`,
    );
  }
}

export function validateFinanceReportDate(date: string): void {
  if (!/^\d{4}-\d{2}$/.test(date)) {
    throw new CliUsageError(
      `--date for a finance report must be YYYY-MM (Apple's fiscal month), got "${date}".`,
    );
  }
}

/** The optional second output format; the on-disk TSV/CSV is always written. */
export function resolveReportFormat(
  raw: string | undefined,
): "json" | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (raw === "json") {
    return "json";
  }
  throw new CliUsageError(
    `--format only supports json (the raw report file is always written), got "${raw}".`,
  );
}

/** Masks a vendor number down to its last four digits for echo in output. */
export function maskVendorNumber(vendorNumber: string): string {
  return `...${vendorNumber.slice(-4)}`;
}
