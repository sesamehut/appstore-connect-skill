import { defineCommand } from "citty";

import { reportsAnalyticsCommand } from "./reports-analytics.js";
import { reportsFinanceCommand } from "./reports-finance.js";
import { reportsSalesCommand } from "./reports-sales.js";

export const reportsCommand = defineCommand({
  meta: {
    name: "reports",
    description: "Sales, finance, and analytics report workflows",
  },
  subCommands: {
    sales: reportsSalesCommand,
    finance: reportsFinanceCommand,
    analytics: reportsAnalyticsCommand,
  },
});
