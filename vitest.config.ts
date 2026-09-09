import { defineConfig } from "vitest/config";
import path from "path";

// Coverage is scoped to pure business logic (calculators, CRM/task/funding/
// permission rules, formatting). React components, Next.js routes/pages,
// middleware, and Supabase client wrappers are integration glue and are
// intentionally excluded — see docs on the 95% coverage gate.
const COVERAGE_INCLUDE = [
  "src/lib/calculators/**/*.ts",
  "src/lib/chartTheme.ts",
  "src/lib/cn.ts",
  "src/lib/crm.ts",
  "src/lib/crmClient.ts",
  "src/lib/format.ts",
  "src/lib/funding.ts",
  "src/lib/permissions.ts",
  "src/lib/pnl.ts",
  "src/lib/tasks.ts",
  "src/lib/tools.ts",
  "src/app/(app)/crm/leadSelect.ts",
];

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: COVERAGE_INCLUDE,
      reporter: ["text", "html"],
      thresholds: {
        perFile: true,
        lines: 95,
        statements: 95,
        branches: 95,
        functions: 95,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
