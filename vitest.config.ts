import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // Integration suites spin up an in-memory mongod per file (slow on first
    // boot) — give the whole run a generous ceiling. Per-hook timeouts in
    // tests/helpers/db.ts handle the boot specifically.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
