import { AscNotFoundError, AscUpstreamError } from "../errors.js";
import type { AscClient } from "../http/client.js";
import type { operations } from "../generated/asc-openapi.js";
import { saveReportStream } from "./report-files.js";
import type { SavedReportFile } from "./report-files.js";
import { carryErrorContext } from "./sales-reports.js";

type FinanceReportsQuery =
  operations["financeReports_getCollection"]["parameters"]["query"];

export type FinanceReportType =
  FinanceReportsQuery["filter[reportType]"][number];

export interface FinanceReportSpec {
  /** Account configuration, not a credential — but still masked in output. */
  readonly vendorNumber: string;
  /** A report region from Payments and Financial Reports; ZZ = consolidated. */
  readonly regionCode: string;
  /** Apple's fiscal month as YYYY-MM (fiscal months shift against calendar). */
  readonly reportDate: string;
  readonly reportType: FinanceReportType;
}

function enrichFinanceNotFound(
  error: AscNotFoundError,
  spec: FinanceReportSpec,
): AscNotFoundError {
  return new AscNotFoundError(
    `No ${spec.reportType} finance report exists for fiscal month ${spec.reportDate} in region ${spec.regionCode} under vendor ...${spec.vendorNumber.slice(-4)}. Finance reports appear only after Apple closes the fiscal month (early in the following calendar month), the date is the FISCAL month (which shifts against the calendar), and the region must match a report listed in App Store Connect → Payments and Financial Reports — ZZ consolidates all regions.`,
    carryErrorContext(error),
  );
}

/**
 * Downloads one finance report straight to disk. Same workflow-layer
 * placement rationale as the sales download: the HTTP call and the file
 * handling are one operation.
 *
 * A 403 here is a meaningful diagnostic, not just an error: finance reports
 * need a key whose role includes finance access, which most developer keys
 * lack — the normalized permission error carries that conversation.
 */
export async function downloadFinanceReport(
  client: AscClient,
  spec: FinanceReportSpec,
  destinationPath: string,
): Promise<SavedReportFile> {
  const query: FinanceReportsQuery = {
    "filter[regionCode]": [spec.regionCode],
    "filter[reportDate]": [spec.reportDate],
    "filter[reportType]": [spec.reportType],
    "filter[vendorNumber]": [spec.vendorNumber],
  };

  let body: AsyncIterable<Uint8Array> | null;
  try {
    const result = await client.GET("/v1/financeReports", {
      params: { query },
      parseAs: "stream",
    });
    body = result.data ?? null;
  } catch (error) {
    throw error instanceof AscNotFoundError
      ? enrichFinanceNotFound(error, spec)
      : error;
  }
  if (body === null) {
    throw new AscUpstreamError(
      "ASC returned a success status without a report body.",
    );
  }
  return saveReportStream(body, destinationPath, {
    sourceTarget: "/v1/financeReports",
  });
}
