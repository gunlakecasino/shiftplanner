import { describe, it, expect } from "vitest";
import { makeRoster, skillScoresFrom, makeContext } from "./fixtures/roster";
import { runWeekEngine, buildWeekContext, weekFairnessPenalties, type WeekEngineInput } from "../week";
import { validateDraft } from "../guard";
import { buildNightContext } from "../context";
import { FALLBACK_CONFIG } from "../../engineConfig";
import { DEFAULT_AUX_DEFS } from "../../constants";

/** Fri→Thu ISO dates for a grave week starting on a Friday. */
const WEEK_START = "2026-07-03"; // a Friday
function graveWeekDates(): string[] {
  const out: string[] = [];
  const base = new Date(`${WEEK_START}T12:00:00`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

/** A full week input: same balanced roster available every night. */
function weekInput(): WeekEngineInput {
  const members = makeRoster({ males: 12, females: 10 });
  const skillScores = skillScoresFrom(members);
  const dates = graveWeekDates();
  return {
    weekStartIso: WEEK_START,
    nights: dates.map((nightIso) => ({
      nightIso,
      config: FALLBACK_CONFIG,
      auxDefs: DEFAULT_AUX_DEFS,
      members,
      assignments: {},
      skillScores,
    })),
  };
}

describe("week engine (P3)", () => {
  it("solves all 7 nights with guard-clean drafts (I1)", () => {
    const input = weekInput();
    const result = runWeekEngine(input, { seed: 42 });
    expect(Object.keys(result.nights).length).toBe(7);
    const week = buildWeekContext(input);
    const ctxByNight = new Map(week.nights.map((c) => [c.nightIso, c] as const));
    for (const [nightIso, draft] of Object.entries(result.nights)) {
      expect(validateDraft(draft, ctxByNight.get(nightIso)!).ok).toBe(true);
    }
  });

  it("drives week repeat violations to zero when the roster permits (I6)", () => {
    const result = runWeekEngine(weekInput(), { seed: 7 });
    // 22 TMs, ~21 filled slots/night — plenty of spread room across 7 nights.
    expect(result.weekScorecard.repeatViolations).toBe(0);
    expect(result.violations.length).toBe(0);
  });

  it("rolling solve blocks a same-area repeat across consecutive nights (I6)", () => {
    // Only just enough males so a TM could be forced to repeat; verify the
    // rolling context prevents a prior-3 repeat when a fresh option exists.
    const result = runWeekEngine(weekInput(), { seed: 3 });
    // For each TM, no area should appear on 3 consecutive-ish nights (prior-3).
    for (const entry of result.fairnessLedger) {
      // With a comfortable roster, no TM should be forced into a repeat area.
      expect(entry.repeatCount).toBe(0);
    }
  });

  it("cross-night polish never regresses the week scorecard (I3-week)", () => {
    // The pipeline adopts the polished week only if it is >= the rolling result,
    // so the final week scorecard is at least as good as post-rolling.
    const result = runWeekEngine(weekInput(), { seed: 11 });
    const rolling = result.telemetry.stages.find((s) => s.stage === "rolling-solve")!;
    const polish = result.telemetry.stages.find((s) => s.stage === "cross-night-polish")!;
    expect(polish.scorecard.coverage).toBeGreaterThanOrEqual(rolling.scorecard.coverage);
    expect(polish.scorecard.healthTotal).toBeGreaterThanOrEqual(rolling.scorecard.healthTotal - 1e-6);
  });

  it("is deterministic for the same seed (I8)", () => {
    const a = runWeekEngine(weekInput(), { seed: 99 });
    const b = runWeekEngine(weekInput(), { seed: 99 });
    expect(sigWeek(a.nights)).toBe(sigWeek(b.nights));
  });

  it("builds a fairness ledger covering placed TMs", () => {
    const result = runWeekEngine(weekInput(), { seed: 1 });
    expect(result.fairnessLedger.length).toBeGreaterThan(0);
    const totalNightsWorked = result.fairnessLedger.reduce((a, e) => a + e.nightsWorked, 0);
    // Every filled slot across the week is one TM-night.
    const filled = Object.values(result.nights).reduce((a, d) => a + Object.keys(d).length, 0);
    expect(totalNightsWorked).toBe(filled);
  });

  it("records rolling-solve and cross-night-polish stages", () => {
    const result = runWeekEngine(weekInput(), { seed: 2 });
    const names = result.telemetry.stages.map((s) => s.stage);
    expect(names).toContain("rolling-solve");
    expect(names).toContain("cross-night-polish");
  });
});

function sigWeek(nights: Record<string, Record<string, { tmId: string }>>): string {
  return Object.keys(nights)
    .sort()
    .map((n) => `${n}[${Object.keys(nights[n]).sort().map((k) => `${k}:${nights[n][k].tmId}`).join(",")}]`)
    .join("|");
}

describe("fairness signals — weekly_load_balance + fatigue_index (P5-1/D3)", () => {
  const slotDifficulty = new Map([
    ["Zone4", 9], ["Zone5", 9], ["Zone3", 1], ["Zone6", 9],
  ]);
  const members = makeRoster({ males: 12, females: 10 });

  function ctxFor(nightIso: string) {
    return makeContext({ members, nightIso, slotDifficulty });
  }
  const draft = (m: Record<string, string>) => {
    const d: any = {};
    for (const [slot, tm] of Object.entries(m)) {
      d[slot] = { tmId: tm, tmName: tm, provenance: { stage: "planner", reason: "", scorecard: { eligible: true, healthPoints: 85, isCritical: false, prefScore: 0, skillScore: 0 } } };
    }
    return d;
  };

  it("penalizes uneven difficulty load across TMs", () => {
    const ctx = ctxFor("2026-07-03");
    const byNight = new Map([[ctx.nightIso, ctx]]);
    const balanced = { "2026-07-03": draft({ Z4: "tm_m1", Z5: "tm_m2" }) }; // loads 9,9
    const skewed = { "2026-07-03": draft({ Z4: "tm_m1", Z3: "tm_m2" }) }; // loads 9,1
    const pBalanced = weekFairnessPenalties(balanced, byNight);
    const pSkewed = weekFairnessPenalties(skewed, byNight);
    expect(pSkewed.loadBalance).toBeGreaterThan(pBalanced.loadBalance);
    expect(pBalanced.loadBalance).toBeCloseTo(0, 5);
  });

  it("penalizes back-to-back high-difficulty nights (fatigue)", () => {
    const n1 = ctxFor("2026-07-03");
    const n2 = ctxFor("2026-07-04");
    const byNight = new Map([[n1.nightIso, n1], [n2.nightIso, n2]]);
    const tired = {
      "2026-07-03": draft({ Z4: "tm_m1" }),
      "2026-07-04": draft({ Z5: "tm_m1" }), // same TM, hard both nights, consecutive
    };
    const rested = {
      "2026-07-03": draft({ Z4: "tm_m1" }),
      "2026-07-04": draft({ Z3: "tm_m1" }), // easy second night
    };
    expect(weekFairnessPenalties(tired, byNight).fatigue).toBeGreaterThan(
      weekFairnessPenalties(rested, byNight).fatigue,
    );
  });
});
