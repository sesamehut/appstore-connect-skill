import { defineCommand } from "citty";

import { defaultSalesReportFileName } from "../../workflows/report-files.js";
import { downloadSalesReport } from "../../workflows/sales-reports.js";
import type {
  SalesReportSubType,
  SalesReportType,
} from "../../workflows/sales-reports.js";
import { cliContextOf } from "../context.js";
import { emitResult } from "../output.js";
import {
  maskVendorNumber,
  resolveReportFormat,
  resolveSalesFrequency,
  resolveVendorNumber,
  validateSalesReportDate,
} from "../report-flags.js";
import { reportFileData } from "../report-output.js";

const downloadCommand = defineCommand({
  meta: {
    name: "download",
    description:
      "Download one sales/trends report as decompressed TSV (optionally also converted to JSON)",
  },
  args: {
    vendor: {
      type: "string",
      valueHint: "number",
      description:
        "Vendor number; defaults to ASC_VENDOR_NUMBER (find it in App Store Connect → Payments and Financial Reports)",
    },
    type: {
      type: "string",
      valueHint: "SALES",
      description:
        "Report type (default SALES); e.g. SALES, SUBSCRIPTION, SUBSCRIBER, INSTALLS",
    },
    subtype: {
      type: "string",
      valueHint: "SUMMARY",
      description: "Report sub-type (default SUMMARY); e.g. SUMMARY, DETAILED",
    },
    frequency: {
      type: "string",
      valueHint: "DAILY",
      description: "DAILY (default), WEEKLY, MONTHLY, or YEARLY",
    },
    date: {
      type: "string",
      valueHint: "2026-06-10",
      description:
        "Report date (DAILY/WEEKLY: YYYY-MM-DD; MONTHLY: YYYY-MM; YEARLY: YYYY). Omit for the latest available report",
    },
    "report-version": {
      type: "string",
      valueHint: "1_1",
      description: "Report format version; ASC's default applies when omitted",
    },
    output: {
      type: "string",
      valueHint: "path",
      description:
        "Destination file path (default: sales-<TYPE>-<SUBTYPE>-<FREQ>-<date>.tsv in the current directory)",
    },
    format: {
      type: "string",
      valueHint: "json",
      description:
        "Additionally convert the report to a JSON file next to the TSV",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const frequency = resolveSalesFrequency(ctx.args.frequency);
    validateSalesReportDate(frequency, ctx.args.date);
    const format = resolveReportFormat(ctx.args.format);
    const spec = {
      vendorNumber: resolveVendorNumber(ctx.args.vendor, cli.env),
      // Enum values pass through for ASC to validate: a stale local list
      // would reject report types Apple has since added.
      reportType: (ctx.args.type ?? "SALES") as SalesReportType,
      reportSubType: (ctx.args.subtype ?? "SUMMARY") as SalesReportSubType,
      frequency,
      ...(ctx.args.date !== undefined && { reportDate: ctx.args.date }),
      ...(ctx.args["report-version"] !== undefined && {
        version: ctx.args["report-version"],
      }),
    };
    const destination = ctx.args.output ?? defaultSalesReportFileName(spec);

    const saved = await downloadSalesReport(
      await cli.client(),
      spec,
      destination,
    );
    const file = await reportFileData(saved, format);

    const rateLimit = cli.lastRateLimit();
    emitResult(cli.io, {
      ok: true,
      command: "reports sales download",
      data: {
        file,
        report: {
          vendorNumber: maskVendorNumber(spec.vendorNumber),
          reportType: spec.reportType,
          reportSubType: spec.reportSubType,
          frequency: spec.frequency,
          reportDate: spec.reportDate ?? "latest",
          ...(spec.version !== undefined && { version: spec.version }),
        },
      },
      ...(rateLimit !== undefined && { rateLimit }),
    });
  },
});

export const reportsSalesCommand = defineCommand({
  meta: {
    name: "sales",
    description: "Sales and trends report downloads",
  },
  subCommands: {
    download: downloadCommand,
  },
});
