import { AscNotFoundError, AscUpstreamError } from "../errors.js";
import type { AscErrorOptions } from "../errors.js";
import type { AscClient } from "../http/client.js";
import type { operations } from "../generated/asc-openapi.js";
import { saveReportStream } from "./report-files.js";
import type { SavedReportFile } from "./report-files.js";

type SalesReportsQuery =
  operations["salesReports_getCollection"]["parameters"]["query"];

export type SalesReportFrequency =
  SalesReportsQuery["filter[frequency]"][number];
export type SalesReportType = SalesReportsQuery["filter[reportType]"][number];
export type SalesReportSubType =
  SalesReportsQuery["filter[reportSubType]"][number];

export interface SalesReportSpec {
  /** Account configuration, not a credential — but still masked in output. */
  readonly vendorNumber: string;
  readonly reportType: SalesReportType;
  readonly reportSubType: SalesReportSubType;
  readonly frequency: SalesReportFrequency;
  /** Omitted = the latest available report (Apple's documented default). */
  readonly reportDate?: string;
  /** Report format version (e.g. "1_1"); ASC's default applies when omitted. */
  readonly version?: string;
}

/** Forwards the response context of the original error into a replacement. */
export function carryErrorContext(error: AscNotFoundError): AscErrorOptions {
  return {
    apiErrors: error.apiErrors,
    ...(error.rateLimit !== undefined && { rateLimit: error.rateLimit }),
    ...(error.request !== undefined && { request: error.request }),
    cause: error,
  };
}

/**
 * Availability semantics per frequency, for the 404 enrichment. Phrased from
 * Apple's documented behavior plus community-known timing; live verification
 * (M5 核实项 4/5) refines the wording if reality disagrees.
 */
const SALES_NOT_FOUND_GUIDANCE: Record<SalesReportFrequency, string> = {
  DAILY:
    "Daily reports appear roughly a day after the business day ends and old ones expire after several months — try a recent date, or omit the date for the latest available report.",
  WEEKLY:
    "Weekly reports are filed under the week's closing date, so a mid-week date finds nothing — use the most recent week-ending date.",
  MONTHLY:
    "Monthly reports appear a few days after the calendar month ends — check the YYYY-MM month is complete.",
  YEARLY:
    "Yearly reports appear after the calendar year ends — check the YYYY year is complete.",
};

function enrichSalesNotFound(
  error: AscNotFoundError,
  spec: SalesReportSpec,
): AscNotFoundError {
  return new AscNotFoundError(
    `No ${spec.frequency} ${spec.reportType}/${spec.reportSubType} sales report exists for ${spec.reportDate ?? "the latest date"} under vendor ...${spec.vendorNumber.slice(-4)}. ${SALES_NOT_FOUND_GUIDANCE[spec.frequency]} A report also stays missing when the app simply had no activity to report.`,
    carryErrorContext(error),
  );
}

/**
 * Downloads one sales/trends report straight to disk. Lives in the workflow
 * layer as a single operation: the one-line HTTP call and the multi-step
 * file handling are inseparable, so a capability-layer forwarder would add
 * a layer without adding a seam.
 */
export async function downloadSalesReport(
  client: AscClient,
  spec: SalesReportSpec,
  destinationPath: string,
): Promise<SavedReportFile> {
  const query: SalesReportsQuery = {
    "filter[frequency]": [spec.frequency],
    "filter[reportType]": [spec.reportType],
    "filter[reportSubType]": [spec.reportSubType],
    "filter[vendorNumber]": [spec.vendorNumber],
    ...(spec.reportDate !== undefined && {
      "filter[reportDate]": [spec.reportDate],
    }),
    ...(spec.version !== undefined && { "filter[version]": [spec.version] }),
  };

  let body: AsyncIterable<Uint8Array> | null;
  try {
    const result = await client.GET("/v1/salesReports", {
      params: { query },
      parseAs: "stream",
    });
    body = result.data ?? null;
  } catch (error) {
    throw error instanceof AscNotFoundError
      ? enrichSalesNotFound(error, spec)
      : error;
  }
  if (body === null) {
    throw new AscUpstreamError(
      "ASC returned a success status without a report body.",
    );
  }
  return saveReportStream(body, destinationPath, {
    sourceTarget: "/v1/salesReports",
  });
}
