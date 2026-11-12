import { defineConfig } from "vitest/config";
import path from "path";

// Integration tests talk to the LOCAL Supabase stack (npm run e2e:db) and prove
// the real RLS policies and function grants. They are kept out of `npm run test`
// (pure, no network) by the *.itest.ts suffix. See docs/testing.md §5.
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.itest.ts"],
    globalSetup: ["tests/integration/access/global-setup.ts"],
    // One database, shared fixtures: run files and tests one at a time.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
