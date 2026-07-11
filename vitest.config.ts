import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest config for pure, Node-runnable primitives — no DOM, no Supabase, no
 * Next runtime.
 *
 * Covers:
 *  - the unified engine (src/lib/shiftbuilder/engine) — invariant suite I1–I10
 *  - the portable tasks core (src/lib/tasks) — recurrence math, etc.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: [
      "src/lib/shiftbuilder/engine/**/*.test.ts",
      "src/lib/shiftbuilder/rotation/**/*.test.ts",
      "src/lib/shiftbuilder/__tests__/**/*.test.ts",
      "src/lib/shiftbuilder/*.test.ts",
      "src/lib/tasks/**/*.test.ts",
      "src/lib/auth/**/*.test.ts",
      "src/app/api/_lib/**/*.test.ts",
    ],
    environment: "node",
    globals: true,
    passWithNoTests: false,
  },
});
