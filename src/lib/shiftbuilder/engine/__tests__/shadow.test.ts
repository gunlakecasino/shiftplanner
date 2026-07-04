import { describe, it, expect } from "vitest";
import { makeRoster, makeContext } from "./fixtures/roster";
import { runNightEngine } from "../index";
import { compareEngineDrafts } from "../shadow";
import type { Draft } from "../types";

function fullContext() {
  return makeContext({ members: makeRoster({ males: 12, females: 10 }) });
}

function tmMapOf(draft: Draft): Record<string, string> {
  const m: Record<string, string> = {};
  for (const [k, p] of Object.entries(draft)) m[k] = p.tmId;
  return m;
}

describe("shadow-mode comparison harness (P6-1)", () => {
  it("reports unified winning on coverage against an under-filled legacy draft", () => {
    const ctx = fullContext();
    const unified = runNightEngine(ctx, { seed: 42 });
    // Legacy fills only three zones — strictly less coverage.
    const legacyMap: Record<string, string> = { Z3: "tm_m1", Z4: "tm_m2", Z5: "tm_m3" };
    const cmp = compareEngineDrafts(legacyMap, unified.draft, ctx);
    expect(cmp.winner).toBe("unified");
    expect(cmp.coverageDelta).toBeGreaterThan(0);
    expect(cmp.unifiedValid).toBe(true);
    expect(cmp.summary).toMatch(/Unified wins/);
  });

  it("reports a tie against an identical draft with zero slot diffs", () => {
    const ctx = fullContext();
    const unified = runNightEngine(ctx, { seed: 7 });
    const cmp = compareEngineDrafts(tmMapOf(unified.draft), unified.draft, ctx);
    expect(cmp.winner).toBe("tie");
    expect(cmp.slotDiffs.length).toBe(0);
    expect(cmp.coverageDelta).toBe(0);
  });

  it("flags an invalid legacy draft (double-book)", () => {
    const ctx = fullContext();
    const unified = runNightEngine(ctx, { seed: 3 });
    const legacyMap: Record<string, string> = { Z3: "tm_m1", Z4: "tm_m1" }; // double-book
    const cmp = compareEngineDrafts(legacyMap, unified.draft, ctx);
    expect(cmp.legacyValid).toBe(false);
    expect(cmp.summary).toMatch(/legacy INVALID/);
  });
});
