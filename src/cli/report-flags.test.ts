import { describe, expect, it } from "vitest";

import { CliUsageError } from "./exit-codes.js";
import {
  ASC_VENDOR_NUMBER_ENV,
  maskVendorNumber,
  resolveReportFormat,
  resolveSalesFrequency,
  resolveVendorNumber,
  validateFinanceReportDate,
  validateSalesReportDate,
} from "./report-flags.js";

describe("resolveSalesFrequency", () => {
  it("defaults to DAILY and accepts the four ASC frequencies", () => {
    expect(resolveSalesFrequency(undefined)).toBe("DAILY");
    expect(resolveSalesFrequency("WEEKLY")).toBe("WEEKLY");
    expect(resolveSalesFrequency("YEARLY")).toBe("YEARLY");
  });

  it("rejects an unknown frequency as a usage error naming the options", () => {
    expect(() => resolveSalesFrequency("HOURLY")).toThrow(CliUsageError);
    expect(() => resolveSalesFrequency("HOURLY")).toThrow(/MONTHLY/);
  });
});

describe("validateSalesReportDate", () => {
  it.each([
    ["DAILY", "2026-06-10"],
    ["WEEKLY", "2026-06-13"],
    ["MONTHLY", "2026-05"],
    ["YEARLY", "2025"],
  ] as const)("accepts %s + %s", (frequency, date) => {
    expect(() => {
      validateSalesReportDate(frequency, date);
    }).not.toThrow();
  });

  it.each([
    ["DAILY", "2026-06"],
    ["WEEKLY", "2026"],
    ["MONTHLY", "2026-06-10"],
    ["YEARLY", "26"],
  ] as const)("rejects %s + %s as a usage error", (frequency, date) => {
    expect(() => {
      validateSalesReportDate(frequency, date);
    }).toThrow(CliUsageError);
  });

  it("accepts an omitted date for any frequency (latest report)", () => {
    expect(() => {
      validateSalesReportDate("DAILY", undefined);
    }).not.toThrow();
    expect(() => {
      validateSalesReportDate("YEARLY", undefined);
    }).not.toThrow();
  });
});

describe("validateFinanceReportDate", () => {
  it("accepts the fiscal-month form and nothing else", () => {
    expect(() => {
      validateFinanceReportDate("2026-05");
    }).not.toThrow();
    expect(() => {
      validateFinanceReportDate("2026-05-01");
    }).toThrow(CliUsageError);
    expect(() => {
      validateFinanceReportDate("2026");
    }).toThrow(CliUsageError);
  });
});

describe("resolveVendorNumber", () => {
  it("prefers the flag over the environment", () => {
    expect(
      resolveVendorNumber("87654321", { [ASC_VENDOR_NUMBER_ENV]: "12345678" }),
    ).toBe("87654321");
  });

  it("falls back to the environment variable", () => {
    expect(
      resolveVendorNumber(undefined, { [ASC_VENDOR_NUMBER_ENV]: "12345678" }),
    ).toBe("12345678");
  });

  it("treats a missing or empty vendor as a usage error naming both sources", () => {
    expect(() => resolveVendorNumber(undefined, {})).toThrow(CliUsageError);
    expect(() =>
      resolveVendorNumber(undefined, { [ASC_VENDOR_NUMBER_ENV]: "" }),
    ).toThrow(new RegExp(ASC_VENDOR_NUMBER_ENV));
  });
});

describe("resolveReportFormat", () => {
  it("accepts only json, treating its absence as no conversion", () => {
    expect(resolveReportFormat(undefined)).toBeUndefined();
    expect(resolveReportFormat("json")).toBe("json");
    expect(() => resolveReportFormat("csv")).toThrow(CliUsageError);
  });
});

describe("maskVendorNumber", () => {
  it("keeps only the last four digits", () => {
    expect(maskVendorNumber("12345678")).toBe("...5678");
  });
});
