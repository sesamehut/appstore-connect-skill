import { defineCommand } from "citty";

import { downloadFinanceReport } from "../../workflows/finance-reports.js";
import type { FinanceReportType } from "../../workflows/finance-reports.js";
import { defaultFinanceReportFileName } from "../../workflows/report-files.js";
import { cliContextOf } from "../context.js";
import { emitResult } from "../output.js";
import {
  maskVendorNumber,
  resolveReportFormat,
  resolveVendorNumber,
  validateFinanceReportDate,
} from "../report-flags.js";
import { reportFileData } from "../report-output.js";

const downloadCommand = defineCommand({
  meta: {
    name: "download",
    description:
      "Download one finance report as decompressed TSV (optionally also converted to JSON); needs a key with finance role access",
  },
  args: {
    vendor: {
      type: "string",
      valueHint: "number",
      description:
        "Vendor number; defaults to ASC_VENDOR_NUMBER (find it in App Store Connect → Payments and Financial Reports)",
    },
    region: {
      type: "string",
      required: true,
      valueHint: "ZZ",
      description:
        "Report region code from Payments and Financial Reports (ZZ = all regions consolidated)",
    },
    date: {
      type: "string",
      required: true,
      valueHint: "2026-05",
      description: "Apple fiscal month as YYYY-MM",
    },
    type: {
      type: "string",
      valueHint: "FINANCIAL",
      description: "FINANCIAL (default) or FINANCE_DETAIL",
    },
    output: {
      type: "string",
      valueHint: "path",
      description:
        "Destination file path (default: finance-<TYPE>-<REGION>-<YYYY-MM>.tsv in the current directory)",
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
    validateFinanceReportDate(ctx.args.date);
    const format = resolveReportFormat(ctx.args.format);
    const spec = {
      vendorNumber: resolveVendorNumber(ctx.args.vendor, cli.env),
      regionCode: ctx.args.region,
      reportDate: ctx.args.date,
      // The enum value passes through for ASC to validate: a stale local
      // list would reject report types Apple has since added.
      reportType: (ctx.args.type ?? "FINANCIAL") as FinanceReportType,
    };
    const destination = ctx.args.output ?? defaultFinanceReportFileName(spec);

    const saved = await downloadFinanceReport(
      await cli.client(),
      spec,
      destination,
    );
    const file = await reportFileData(saved, format);

    const rateLimit = cli.lastRateLimit();
    emitResult(cli.io, {
      ok: true,
      command: "reports finance download",
      data: {
        file,
        report: {
          vendorNumber: maskVendorNumber(spec.vendorNumber),
          reportType: spec.reportType,
          regionCode: spec.regionCode,
          reportDate: spec.reportDate,
        },
      },
      ...(rateLimit !== undefined && { rateLimit }),
    });
  },
});

export const reportsFinanceCommand = defineCommand({
  meta: {
    name: "finance",
    description: "Finance report downloads",
  },
  subCommands: {
    download: downloadCommand,
  },
});
