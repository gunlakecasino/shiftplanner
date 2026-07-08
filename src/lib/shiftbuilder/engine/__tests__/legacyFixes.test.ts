/**
 * Phase 0 regression locks — the live-code defects fixed on 2026-07-02.
 * These test the *legacy* functions directly (not the engine), so the fixes
 * can't silently regress while the unified pipeline is being wired in.
 */
import { describe, it, expect } from "vitest";
import { pickerVerdictFromHealthPoints } from "../../rotationHealthEngineContext";
import { computeDragFitMap } from "../../dragFit";
import { calculateCoverageFeasibility } from "../../skills/placement-engine/core/target-derivation";

describe("F8 — picker verdict never misreads a critical (P0-6)", () => {
  it("a critical repeat capped below 50 still reads critical_repeat", () => {
    expect(pickerVerdictFromHealthPoints(43, true)).toBe("critical_repeat");
    expect(pickerVerdictFromHealthPoints(50, true)).toBe("critical_repeat");
  });
  it("non-critical scores map to their band", () => {
    expect(pickerVerdictFromHealthPoints(95, false)).toBe("strong_fit");
    expect(pickerVerdictFromHealthPoints(80, false)).toBe("acceptable");
    expect(pickerVerdictFromHealthPoints(60, false)).toBe("questionable");
    expect(pickerVerdictFromHealthPoints(30, false)).toBe("needs_swap");
    expect(pickerVerdictFromHealthPoints(10, false)).toBe("poor_fit");
  });
});

describe("F9 — drag halos count repeats area-merged (P0-7)", () => {
  const profile = { gender: "M", gravePool: "Full", isAMOverlap: false, isPMOverlap: false };
  const weeklyRecentHistory = new Map([
    ["tm_m1", [
      { nightDate: "2026-07-01", slotKey: "WRR8" },
      { nightDate: "2026-07-02", slotKey: "MRR8" },
    ]],
  ]);
  it("WRR8 + MRR8 history makes MRR8 a poor halo (RR8 area, 2×)", () => {
    const map = computeDragFitMap({
      profile, tmId: "tm_m1", slotKeys: ["MRR8", "MRR6"],
      currentIso: "2026-07-03", weeklyRecentHistory,
    });
    expect(map.MRR8).toBe("poor");
    expect(map.MRR6).toBe("great");
  });
});

describe("F10 — gender-aware feasibility (P0-8)", () => {
  it("21 full-grave men cannot clear Tier 1 (5 women short)", () => {
    const f = calculateCoverageFeasibility(21, { male: 21, female: 0 });
    expect(f.femaleShortfall).toBe(5);
    expect(f.tiersFullyCleared).not.toContain("Core - Admin + Zones");
    expect(f.explanation).toMatch(/female/i);
  });
  it("a balanced 12M + 10F roster clears both tiers", () => {
    const f = calculateCoverageFeasibility(22, { male: 12, female: 10 });
    expect(f.maleShortfall).toBe(0);
    expect(f.femaleShortfall).toBe(0);
    expect(f.tiersFullyCleared).toContain("Core - Zones");
  });
  it("single-arg form stays gender-blind (backward compatible)", () => {
    const f = calculateCoverageFeasibility(21);
    expect(f.maleShortfall).toBeUndefined();
    expect(f.tiersFullyCleared.length).toBeGreaterThan(0);
  });
});
