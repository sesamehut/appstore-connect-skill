import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests sit next to their subject in src/; integration-style tests
    // live in tests/ (Testing Trophy bias: mostly integration).
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // Generated contract artifacts are types-only; coverage over them is
      // meaningless noise in the report.
      exclude: [...coverageConfigDefaults.exclude, "src/generated/**"],
    },
  },
});
