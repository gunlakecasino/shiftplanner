import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const optimizerPath = resolve(
  process.cwd(),
  "src/lib/shiftbuilder/engine/optimizer.ts",
);
const timefoldDir = resolve(process.cwd(), "src/lib/shiftbuilder/timefold");

const liveAppFiles = [
  "src/app/shiftbuilder/ShiftBuilderClient.tsx",
  "src/app/shiftbuilder/components/ShiftBuilderBoard.tsx",
  "src/app/shiftbuilder/components/RotationHealthFloater.tsx",
  "src/app/shiftbuilder/components/FloatingNav.tsx",
  "src/app/shiftbuilder/hooks/useEngineRunner.ts",
  "src/lib/shiftbuilder/engine/index.ts",
];

describe("Timefold dead lib leftovers", () => {
  it("never deletes engine/optimizer.ts", () => {
    expect(existsSync(optimizerPath)).toBe(true);
    const src = readFileSync(optimizerPath, "utf8");
    expect(src).toContain("export function runOptimizer");
  });

  it("quarantines orphaned timefold mock/types when live app has zero imports", () => {
    if (existsSync(timefoldDir)) {
      const leftover = readdirSync(timefoldDir).filter((name) => !name.startsWith("."));
      expect(leftover).toEqual([]);
    }
    for (const rel of liveAppFiles) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      expect(src).not.toContain("@/lib/shiftbuilder/timefold/");
      expect(src).not.toContain("timefold/timefoldTypes");
      expect(src).not.toContain("useTimefoldOptimize");
      expect(src).not.toContain("TimefoldResultsSheet");
    }
  });
});
