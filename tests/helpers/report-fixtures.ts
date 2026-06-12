/**
 * Tiny report bodies with Apple's real column names, kept as source strings
 * (gzipped at test time) so no binary blob ever sits in the repo.
 */

export const SALES_SUMMARY_HEADER = [
  "Provider",
  "Provider Country",
  "SKU",
  "Developer",
  "Title",
  "Version",
  "Product Type Identifier",
  "Units",
  "Developer Proceeds",
  "Begin Date",
  "End Date",
  "Customer Currency",
  "Country Code",
].join("\t");

export const SALES_SUMMARY_TSV = [
  SALES_SUMMARY_HEADER,
  [
    "APPLE",
    "US",
    "sonara",
    "Sesame Hut",
    "Sonara",
    "1.2",
    "1F",
    "3",
    "2.1",
    "06/10/2026",
    "06/10/2026",
    "USD",
    "US",
  ].join("\t"),
  [
    "APPLE",
    "US",
    "sonara",
    "Sesame Hut",
    "Sonara",
    "1.2",
    "1F",
    "1",
    "4.9",
    "06/10/2026",
    "06/10/2026",
    "CNY",
    "CN",
  ].join("\t"),
  "",
].join("\n");

export const FINANCE_REPORT_TSV = [
  [
    "Start Date",
    "End Date",
    "UPC",
    "ISRC/ISBN",
    "Vendor Identifier",
    "Quantity",
    "Partner Share",
    "Extended Partner Share",
    "Partner Share Currency",
    "Sales or Return",
    "Apple Identifier",
  ].join("\t"),
  [
    "05/04/2026",
    "05/31/2026",
    "",
    "",
    "sonara",
    "2",
    "4.55",
    "9.10",
    "USD",
    "S",
    "6761486081",
  ].join("\t"),
  "",
].join("\n");

export const ANALYTICS_SEGMENT_CSV = [
  ["Date", "App Name", "App Apple Identifier", "Counts", "Unique Devices"].join(
    ",",
  ),
  ["2026-06-10", "Sonara", "6761486081", "14", "9"].join(","),
  ["2026-06-11", "Sonara", "6761486081", "18", "11"].join(","),
  "",
].join("\n");
